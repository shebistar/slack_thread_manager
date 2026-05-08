import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import type { WebAPICallResult } from '@slack/web-api';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export interface SlackThread {
  ts: string;
  text: string;
  user: string;
  replyCount: number;
  latestReplyTs?: string;
  threadTs: string;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  threadTs?: string;
  latestReply?: string;
  raw: Record<string, unknown>;
}

export interface ChannelHistoryResult {
  messages: SlackMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface ThreadRepliesResult {
  messages: SlackMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

@Injectable()
export class SlackClientService implements OnModuleInit {
  private readonly logger = new Logger(SlackClientService.name);
  private client: WebClient | null = null;
  private configured = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (token) {
      this.client = new WebClient(token, {
        retryConfig: { retries: 0 },
      });
      this.configured = true;
      this.logger.log('Slack client initialized');
    } else {
      this.logger.warn(
        'SLACK_BOT_TOKEN not configured — Slack integration disabled',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async testConnection(): Promise<{ ok: boolean; team?: string; error?: string }> {
    if (!this.client) {
      return { ok: false, error: 'Slack client not configured' };
    }

    try {
      const result = await this.callWithRetry(() => this.client!.auth.test());
      return {
        ok: true,
        team: (result as unknown as Record<string, unknown>).team as string,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: msg };
    }
  }

  async fetchChannelHistory(
    channelId: string,
    options?: { oldest?: string; latest?: string; cursor?: string; limit?: number },
  ): Promise<ChannelHistoryResult> {
    this.ensureConfigured();

    const result = await this.callWithRetry(() =>
      this.client!.conversations.history({
        channel: channelId,
        oldest: options?.oldest,
        latest: options?.latest,
        cursor: options?.cursor,
        limit: options?.limit ?? 100,
        inclusive: true,
      }),
    );

    const raw = result as unknown as Record<string, unknown>;
    const messages = ((raw.messages as Record<string, unknown>[]) ?? []).map(
      (m) => this.toSlackMessage(m),
    );

    return {
      messages,
      hasMore: !!(raw.has_more as boolean),
      nextCursor: (raw.response_metadata as Record<string, unknown>)
        ?.next_cursor as string | undefined,
    };
  }

  async fetchThreadReplies(
    channelId: string,
    threadTs: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<ThreadRepliesResult> {
    this.ensureConfigured();

    const result = await this.callWithRetry(() =>
      this.client!.conversations.replies({
        channel: channelId,
        ts: threadTs,
        cursor: options?.cursor,
        limit: options?.limit ?? 200,
      }),
    );

    const raw = result as unknown as Record<string, unknown>;
    const messages = ((raw.messages as Record<string, unknown>[]) ?? []).map(
      (m) => this.toSlackMessage(m),
    );

    return {
      messages,
      hasMore: !!(raw.has_more as boolean),
      nextCursor: (raw.response_metadata as Record<string, unknown>)
        ?.next_cursor as string | undefined,
    };
  }

  async fetchChannelInfo(
    channelId: string,
  ): Promise<{ name: string; id: string; numMembers: number }> {
    this.ensureConfigured();

    const result = await this.callWithRetry(() =>
      this.client!.conversations.info({ channel: channelId }),
    );

    const raw = result as unknown as Record<string, unknown>;
    const channel = raw.channel as Record<string, unknown>;

    return {
      id: channel.id as string,
      name: channel.name as string,
      numMembers: (channel.num_members as number) ?? 0,
    };
  }

  private async callWithRetry<T extends WebAPICallResult>(
    fn: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        const errObj = error as Record<string, unknown>;

        if (this.isRateLimited(errObj)) {
          const retryAfter = this.getRetryAfterMs(errObj);
          this.logger.warn(
            `Rate limited by Slack API, retrying after ${retryAfter}ms`,
          );
          await this.sleep(retryAfter);
          continue;
        }

        if (attempt < MAX_RETRIES && this.isRetryable(errObj)) {
          const delay = this.calculateBackoff(attempt);
          this.logger.warn(
            `Slack API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms`,
            { error: this.sanitizeError(errObj) },
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.error('Slack API call failed', {
          error: this.sanitizeError(errObj),
          attempt: attempt + 1,
        });
        break;
      }
    }

    throw lastError;
  }

  private isRateLimited(error: Record<string, unknown>): boolean {
    return (
      (error.code as string) === 'slack_webapi_platform_error' &&
      (error.data as Record<string, unknown>)?.error === 'ratelimited'
    ) || (error.code as string) === 'slack_webapi_rate_limited_error';
  }

  private getRetryAfterMs(error: Record<string, unknown>): number {
    const headers = error.headers as Record<string, string> | undefined;
    const retryAfter = headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (retryAfter) {
      return Math.max(parseInt(retryAfter, 10) * 1000, 1000);
    }
    const retryAfterMs = (error as Record<string, unknown>).retryAfter;
    if (typeof retryAfterMs === 'number') {
      return retryAfterMs * 1000;
    }
    return 5000;
  }

  private isRetryable(error: Record<string, unknown>): boolean {
    const code = error.code as string;
    return (
      code === 'slack_webapi_request_error' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND'
    );
  }

  private calculateBackoff(attempt: number): number {
    const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = Math.random() * BASE_DELAY_MS;
    return Math.min(exponential + jitter, MAX_DELAY_MS);
  }

  private sanitizeError(error: Record<string, unknown>): Record<string, unknown> {
    const { token, ...safe } = error;
    return safe;
  }

  private toSlackMessage(raw: Record<string, unknown>): SlackMessage {
    return {
      ts: raw.ts as string,
      user: (raw.user as string) ?? 'unknown',
      text: (raw.text as string) ?? '',
      threadTs: raw.thread_ts as string | undefined,
      latestReply: raw.latest_reply as string | undefined,
      raw,
    };
  }

  private ensureConfigured(): void {
    if (!this.client) {
      throw new Error(
        'Slack client not configured. Set SLACK_BOT_TOKEN environment variable.',
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
