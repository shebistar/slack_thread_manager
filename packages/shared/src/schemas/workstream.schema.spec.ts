import { describe, it, expect } from 'vitest';
import { createWorkstreamSchema, workstreamSchema, userWorkstreamSchema } from './workstream.schema.js';

describe('createWorkstreamSchema', () => {
  it('accepts a valid workstream payload', () => {
    const result = createWorkstreamSchema.safeParse({
      name: 'vm-migration',
      description: 'VM migration workstream',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null description', () => {
    const result = createWorkstreamSchema.safeParse({ name: 'vm-migration', description: null });
    expect(result.success).toBe(true);
  });

  it('accepts omitted description', () => {
    const result = createWorkstreamSchema.safeParse({ name: 'vm-migration' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createWorkstreamSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 characters', () => {
    const result = createWorkstreamSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = createWorkstreamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('workstreamSchema', () => {
  const validWorkstream = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    name: 'vm-migration',
    description: null,
    createdAt: '2026-05-07T09:00:00.000Z',
  };

  it('accepts a complete workstream object', () => {
    expect(workstreamSchema.safeParse(validWorkstream).success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _, ...withoutId } = validWorkstream;
    expect(workstreamSchema.safeParse(withoutId).success).toBe(false);
  });
});

describe('userWorkstreamSchema', () => {
  it('accepts valid UUIDs', () => {
    const result = userWorkstreamSchema.safeParse({
      userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      workstreamId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID userId', () => {
    const result = userWorkstreamSchema.safeParse({
      userId: 'not-a-uuid',
      workstreamId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    });
    expect(result.success).toBe(false);
  });
});
