import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import {
  anonymizationBlocklist,
  classifiedTopics,
  slackThreads,
} from '@slack-thread-manager/db';
import type { Database, AnonymizationBlocklistEntry } from '@slack-thread-manager/db';
import type { SummaryShape, BlocklistMatch, AnonymizationResult } from '@slack-thread-manager/shared';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

export interface BlocklistFilterResult {
  threadsScanned: number;
  threadsWithMatches: number;
  totalMatches: number;
  results: AnonymizationResult[];
}

interface CompiledTerm {
  entry: AnonymizationBlocklistEntry;
  pattern: RegExp;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermPattern(term: string): RegExp | null {
  const trimmed = term.trim();
  if (!trimmed) return null;
  const escaped = escapeRegex(trimmed);
  return new RegExp(`\\b(${escaped}(?:'s|s'|s|es)?)\\b`, 'gi');
}

@Injectable()
export class BlocklistFilterProcessor {
  private readonly logger = new Logger(BlocklistFilterProcessor.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async runFilter(): Promise<BlocklistFilterResult> {
    const startTime = Date.now();

    const threads = await this.db
      .select({ id: slackThreads.id })
      .from(slackThreads)
      .where(eq(slackThreads.pipelineState, 'embedded'));

    if (threads.length === 0) {
      this.logger.log('No embedded threads to filter');
      return { threadsScanned: 0, threadsWithMatches: 0, totalMatches: 0, results: [] };
    }

    const blocklistEntries = await this.db
      .select()
      .from(anonymizationBlocklist);

    const compiledTerms: CompiledTerm[] = [];
    for (const entry of blocklistEntries) {
      const pattern = buildTermPattern(entry.term);
      if (pattern) {
        compiledTerms.push({ entry, pattern });
      }
    }

    if (compiledTerms.length === 0) {
      this.logger.log('No active blocklist terms — passing all threads through with empty flags');
    }

    const threadIds = threads.map((t) => t.id);
    const topics = await this.db
      .select()
      .from(classifiedTopics)
      .where(inArray(classifiedTopics.threadId, threadIds));

    const topicsByThread = new Map(topics.map((t) => [t.threadId, t]));

    const results: AnonymizationResult[] = [];
    let totalMatches = 0;

    for (const thread of threads) {
      try {
        const topic = topicsByThread.get(thread.id);
        if (!topic) {
          this.logger.warn('No classified topic found for embedded thread', { threadId: thread.id });
          continue;
        }

        const technicalSummary = topic.technicalSummary as SummaryShape | null;
        const plainSummary = topic.plainSummary as SummaryShape | null;

        if (!technicalSummary && !plainSummary) {
          this.logger.warn('No summary content for thread', { threadId: thread.id });
          continue;
        }

        const originalContent = {
          technicalSummary: technicalSummary ?? { headline: '', body: '', key_decisions: [], action_items: [] },
          plainSummary: plainSummary ?? { headline: '', body: '', key_decisions: [], action_items: [] },
        };

        const anonymizedContent = structuredClone(originalContent);
        const flags: BlocklistMatch[] = [];

        for (const { entry, pattern } of compiledTerms) {
          const matchPositions = this.scanAndReplace(anonymizedContent, pattern, entry.term, entry.replacement);

          if (matchPositions.length > 0) {
            flags.push({
              term: entry.term,
              replacement: entry.replacement,
              category: entry.category,
              source: 'BLOCKLIST' as const,
              positions: matchPositions,
            });
            totalMatches += matchPositions.length;
          }
        }

        results.push({
          threadId: thread.id,
          originalContent,
          anonymizedContent,
          flags,
        });
      } catch (err) {
        this.logger.error('Error processing thread for blocklist filter', {
          threadId: thread.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const threadsWithMatches = results.filter((r) => r.flags.length > 0).length;
    const durationMs = Date.now() - startTime;

    this.logger.log('Blocklist filter completed', {
      threadsScanned: threads.length,
      threadsWithMatches,
      totalMatches,
      durationMs,
    });

    return {
      threadsScanned: threads.length,
      threadsWithMatches,
      totalMatches,
      results,
    };
  }

  private scanAndReplace(
    content: { technicalSummary: SummaryShape; plainSummary: SummaryShape },
    pattern: RegExp,
    term: string,
    replacement: string,
  ): Array<{ field: string; startIndex: number; endIndex: number }> {
    const positions: Array<{ field: string; startIndex: number; endIndex: number }> = [];
    const termLower = term.toLowerCase();

    const summaryTypes = ['technicalSummary', 'plainSummary'] as const;
    const stringFields = ['headline', 'body'] as const;
    const arrayFields = ['key_decisions', 'action_items'] as const;

    for (const summaryType of summaryTypes) {
      const summary = content[summaryType];

      for (const field of stringFields) {
        const fieldPath = `${summaryType}.${field}`;
        const text = summary[field];
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          positions.push({
            field: fieldPath,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
        }

        summary[field] = text.replace(pattern, (matched) => {
          return this.replacePreservingSuffix(matched, termLower, replacement);
        });
      }

      for (const field of arrayFields) {
        const fieldPath = `${summaryType}.${field}`;
        const items = summary[field];

        for (let i = 0; i < items.length; i++) {
          const itemFieldPath = `${fieldPath}[${i}]`;
          const text = items[i];
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = pattern.exec(text)) !== null) {
            positions.push({
              field: itemFieldPath,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }

          items[i] = text.replace(pattern, (matched) => {
            return this.replacePreservingSuffix(matched, termLower, replacement);
          });
        }
      }
    }

    return positions;
  }

  private replacePreservingSuffix(matched: string, termLower: string, replacement: string): string {
    const matchedLower = matched.toLowerCase();
    if (matchedLower.startsWith(termLower)) {
      const suffix = matched.slice(termLower.length);
      return replacement + suffix;
    }
    return replacement;
  }
}
