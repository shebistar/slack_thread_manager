import { describe, it, expect } from 'vitest';
import { summarizationResultSchema } from '@slack-thread-manager/shared';
import goldenFixtures from './summarize.golden.json';

describe('summarize.golden.json', () => {
  it('should contain at least one fixture', () => {
    expect(goldenFixtures.length).toBeGreaterThanOrEqual(1);
  });

  it.each(goldenFixtures.map((f, i) => [i, f]))(
    'fixture[%i] should match summarizationResultSchema',
    (_index, fixture) => {
      const result = summarizationResultSchema.safeParse(fixture);
      expect(result.success).toBe(true);
    },
  );

  it('should include fixtures with and without action items', () => {
    const withActions = goldenFixtures.filter(
      (f) =>
        f.technical_summary.action_items.length > 0 ||
        f.plain_summary.action_items.length > 0,
    );
    const withoutActions = goldenFixtures.filter(
      (f) =>
        f.technical_summary.action_items.length === 0 &&
        f.plain_summary.action_items.length === 0,
    );
    expect(withActions.length).toBeGreaterThanOrEqual(1);
    expect(withoutActions.length).toBeGreaterThanOrEqual(1);
  });
});
