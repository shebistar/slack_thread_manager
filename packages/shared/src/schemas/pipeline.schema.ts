import { z } from 'zod';

export const classificationResultSchema = z.object({
  primary_topic: z.string().min(1),
  secondary_topics: z.array(z.string()),
  workstream_id: z.string().nullable(),
  confidence_score: z.number().min(0).max(1),
});

export type ClassificationResult = z.infer<typeof classificationResultSchema>;

const coerceToString = z.preprocess((val) => {
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    return obj.text ?? obj.description ?? obj.action ?? JSON.stringify(val);
  }
  return String(val);
}, z.string());

export const summarySchema = z.object({
  headline: z.string().min(1),
  body: z.string().min(1),
  key_decisions: z.array(coerceToString),
  action_items: z.array(coerceToString),
});

export const summarizationResultSchema = z.object({
  technical_summary: summarySchema,
  plain_summary: summarySchema,
});

export type SummaryShape = z.infer<typeof summarySchema>;
export type SummarizationResult = z.infer<typeof summarizationResultSchema>;
