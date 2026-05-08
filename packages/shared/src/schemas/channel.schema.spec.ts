import { describe, it, expect } from 'vitest';
import { createChannelSchema, channelSchema } from './channel.schema.js';

describe('createChannelSchema', () => {
  const validChannel = {
    slackChannelId: 'C01ABC123',
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

  it('accepts valid Slack channel ID formats', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'C01ABC123' }).success).toBe(true);
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'G01ABC123' }).success).toBe(true);
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'D01ABC123' }).success).toBe(true);
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'C012AB3CDEFGH' }).success).toBe(true);
  });

  it('rejects lowercase Slack channel IDs', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'c0abc123x' }).success).toBe(false);
  });

  it('rejects Slack IDs with wrong prefix', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'U01ABC123' }).success).toBe(false);
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'T01ABC123' }).success).toBe(false);
  });

  it('rejects Slack IDs that are too short', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'C01AB' }).success).toBe(false);
  });

  it('rejects Slack IDs with special characters', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'C01ABC-23' }).success).toBe(false);
  });

  it('rejects empty slackChannelId', () => {
    expect(createChannelSchema.safeParse({ ...validChannel, slackChannelId: '' }).success).toBe(false);
  });

  it('rejects slackChannelId over 20 characters', () => {
    expect(
      createChannelSchema.safeParse({ ...validChannel, slackChannelId: 'C' + 'A'.repeat(20) }).success,
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

  it('accepts null workstreamId for general-purpose channels', () => {
    const result = createChannelSchema.safeParse({ ...validChannel, workstreamId: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workstreamId).toBeNull();
    }
  });

  it('accepts omitted workstreamId for general-purpose channels', () => {
    const { workstreamId: _, ...noWorkstream } = validChannel;
    const result = createChannelSchema.safeParse(noWorkstream);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workstreamId).toBeUndefined();
    }
  });

  it('rejects missing required fields', () => {
    expect(createChannelSchema.safeParse({}).success).toBe(false);
  });
});

describe('channelSchema', () => {
  const validFullChannel = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    slackChannelId: 'C01ABC123',
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
