export const SUMMARIZE_PROMPT_VERSION = 'summarize-v1';

export function buildSummarizationPrompt(
  threadContent: string,
  classificationContext: {
    primaryTopic: string;
    secondaryTopics: string[];
    workstreamName: string | null;
  },
  participantRoster: Array<{
    handle: string;
    role: string;
    displayName: string;
  }>,
): string {
  const workstreamLabel = classificationContext.workstreamName ?? 'unassigned';

  const topicContext = [
    `Primary topic: "${classificationContext.primaryTopic}"`,
    classificationContext.secondaryTopics.length > 0
      ? `Secondary topics: ${classificationContext.secondaryTopics.map((t) => `"${t}"`).join(', ')}`
      : null,
    `Workstream: "${workstreamLabel}"`,
  ]
    .filter(Boolean)
    .join('\n');

  const rosterSection =
    participantRoster.length > 0
      ? participantRoster
          .map((p) => `  - @${p.handle}: ${p.displayName} (${p.role})`)
          .join('\n')
      : '  (no known participants)';

  return `You are a thread summarizer for a project management intelligence system. Generate two summaries of the following Slack thread conversation: one technical and one plain-language.

## Classification Context
${topicContext}

## Participant Roster
${rosterSection}

## Thread Content
${threadContent}

## Instructions
Generate two summaries of this thread:

1. **technical_summary**: Preserve technical jargon, code references, architectural terms, and cross-references. Written for architects and consultants who need full technical depth.
2. **plain_summary**: Translate all jargon into plain language. Written for project managers, sales, and training staff who need to understand impact and decisions without technical details.

For BOTH summaries, include:
- **headline**: One concise sentence capturing the core topic (max ~15 words)
- **body**: 2-3 paragraphs summarizing the discussion. Reference participants by name and role when attributing statements or decisions.
- **key_decisions**: Array of commitments or decisions made in this thread. Empty array if none.
- **action_items**: Array of tasks assigned or implied. Include who is responsible if identifiable. Empty array if none.

Respond with ONLY a valid JSON object matching this exact shape, no additional text:
{"technical_summary":{"headline":"string","body":"string","key_decisions":["string"],"action_items":["string"]},"plain_summary":{"headline":"string","body":"string","key_decisions":["string"],"action_items":["string"]}}`;
}
