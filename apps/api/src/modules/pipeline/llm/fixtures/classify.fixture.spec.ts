import { describe, it, expect } from 'vitest';
import { classificationResultSchema } from '@slack-thread-manager/shared';
import goldenFixtures from './classify.golden.json';

describe('classify.golden.json', () => {
  it('should contain at least one fixture', () => {
    expect(goldenFixtures.length).toBeGreaterThanOrEqual(1);
  });

  it.each(goldenFixtures.map((f, i) => [i, f]))(
    'fixture[%i] should match classificationResultSchema',
    (_index, fixture) => {
      const result = classificationResultSchema.safeParse(fixture);
      expect(result.success).toBe(true);
    },
  );

  it('should include fixtures with and without workstream_id', () => {
    const withWorkstream = goldenFixtures.filter((f) => f.workstream_id !== null);
    const withoutWorkstream = goldenFixtures.filter((f) => f.workstream_id === null);
    expect(withWorkstream.length).toBeGreaterThanOrEqual(1);
    expect(withoutWorkstream.length).toBeGreaterThanOrEqual(1);
  });
});
