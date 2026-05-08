export const CLASSIFY_PROMPT_VERSION = 'classify-v1';

export function buildClassificationPrompt(
  threadContent: string,
  workstreamNames: string[],
): string {
  const workstreamList =
    workstreamNames.length > 0
      ? workstreamNames.map((name, i) => `  ${i + 1}. "${name}"`).join('\n')
      : '  (no workstreams configured)';

  return `You are a thread classifier for a project management intelligence system. Analyze the following Slack thread conversation and classify it.

## Available Workstreams
${workstreamList}

## Thread Content
${threadContent}

## Instructions
Classify this thread by identifying its primary topic, any secondary topics, which workstream it belongs to, and your confidence in the classification.

Rules:
- primary_topic: A concise label (2-5 words) describing the main subject
- secondary_topics: 0-3 related topic labels (empty array if none)
- workstream_id: The exact workstream name from the list above that best matches, or null if no workstream fits
- confidence_score: A number from 0.0 to 1.0 representing your confidence in this classification (0.8+ for clear topics, 0.5-0.8 for ambiguous, below 0.5 for uncertain)

Respond with ONLY a valid JSON object matching this exact shape, no additional text:
{"primary_topic": "string", "secondary_topics": ["string"], "workstream_id": "string or null", "confidence_score": 0.0}`;
}
