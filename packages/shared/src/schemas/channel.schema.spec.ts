import { describe, it, expect } from 'vitest';
import { createChannelSchema, channelSchema } from './channel.schema.js';

describe('createChannelSchema', () => {
  const validChannel = {
    slackChannelId: 'C0ABC123',
    name: 'vm-migration-general',
    workstreamId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    isActive: true,
  };

  it('accepts a valid channel payload', () => {
    expect(createChannelSchema.safeParse(validChannel).success).toBe(true);
  });

  it('defaults isActive to true when omitted', () => {
    const { isActive: _, ...withoutActive } = validChannel;
    const result = createChannelSchema.safeParse(withoutActive);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it('accepts lowercase and varied-length Slack IDs', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'c0abc123' }).success).toBe(true);
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'D012AB3CDEFGH' }).success).toBe(true);
  });

  it('rejects empty slackChannelId', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: '' }).success).toBe(false);
  });

  it('rejects slackChannelId over 20 characters', () => {
    expect(
      createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'A'.repeat(21) }).success,
    ).toBe(false);
  });

  it('rejects empty name', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, name: '' }).success).toBe(false);
  });

  it('rejects invalid workstreamId UUID', () => {
    expect(
      createChannelSchema.safeParse({ ...validChannel, workstreamId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(createChannelSchema.safeParse({}).success).toBe(false);
  });
});

describe('channelSchema', () => {
  const validFullChannel = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    slackChannelId: 'C0ABC123',
    name: 'vm-migration-general',
    workstreamId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    isActive: true,
    createdAt: '2026-05-07T09:00:00.000Z',
  };

  it('accepts a complete channel object', () => {
    expect(channelSchema.safeParse(validFullChannel).success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _, ...withoutId } = validFullChannel;
    expect(channelSchema.safeParse(withoutId).success).toBe(false);
  });

  it('rejects invalid createdAt datetime', () => {
    expect(
      channelSchema.safeParse({ ...validFullChannel, createdAt: '2026-05-07' }).success,
    ).toBe(false);
  });
});
