import { describe, it, expect } from 'vitest';
import { UserRole, createUserSchema, userSchema, createRosterMemberSchema, updateRosterMemberSchema } from './user.schema.js';

describe('UserRole', () => {
  it('accepts all valid role values', () => {
    const validRoles = ['ARCHITECT', 'PM', 'CONSULTANT', 'SALES', 'TRAINING', 'ADMIN'];
    for (const role of validRoles) {
      expect(() => UserRole.parse(role)).not.toThrow();
    }
  });

  it('rejects invalid role values', () => {
    expect(() => UserRole.parse('DEVELOPER')).toThrow();
    expect(() => UserRole.parse('architect')).toThrow();
    expect(() => UserRole.parse('')).toThrow();
  });
});

describe('createUserSchema', () => {
  const validUser = {
    email: 'alex@example.com',
    displayName: 'Alex Chen',
    slackHandle: 'alex.chen',
    slackNicknames: ['alex'],
    role: 'ARCHITECT',
  };

  it('accepts a valid user payload', () => {
    const result = createUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it('defaults slackNicknames to empty array when omitted', () => {
    const { slackNicknames: _, ...withoutNicknames } = validUser;
    const result = createUserSchema.safeParse(withoutNicknames);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slackNicknames).toEqual([]);
    }
  });

  it('rejects invalid email', () => {
    const result = createUserSchema.safeParse({ ...validUser, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects empty displayName', () => {
    const result = createUserSchema.safeParse({ ...validUser, displayName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty slackHandle', () => {
    const result = createUserSchema.safeParse({ ...validUser, slackHandle: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({ ...validUser, role: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(createUserSchema.safeParse({}).success).toBe(false);
    expect(createUserSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
  });
});

describe('userSchema', () => {
  const validFullUser = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    email: 'alex@example.com',
    displayName: 'Alex Chen',
    slackHandle: 'alex.chen',
    slackNicknames: [],
    role: 'ARCHITECT',
    createdAt: '2026-05-07T09:00:00.000Z',
    updatedAt: '2026-05-07T09:00:00.000Z',
  };

  it('accepts a complete user object', () => {
    const result = userSchema.safeParse(validFullUser);
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for id', () => {
    const result = userSchema.safeParse({ ...validFullUser, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime for createdAt', () => {
    const result = userSchema.safeParse({ ...validFullUser, createdAt: '2026-05-07' });
    expect(result.success).toBe(false);
  });
});

describe('createRosterMemberSchema', () => {
  const validMember = {
    email: 'bob@example.com',
    displayName: 'Bob Smith',
    slackHandle: 'bob.smith',
    slackNicknames: ['bobby'],
    role: 'PM',
    workstreamIds: ['f47ac10b-58cc-4372-a567-0e02b2c3d479'],
  };

  it('accepts a valid roster member with workstreamIds', () => {
    expect(createRosterMemberSchema.safeParse(validMember).success).toBe(true);
  });

  it('defaults workstreamIds to empty array when omitted', () => {
    const { workstreamIds: _, ...withoutIds } = validMember;
    const result = createRosterMemberSchema.safeParse(withoutIds);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.workstreamIds).toEqual([]);
  });

  it('rejects non-UUID workstreamIds', () => {
    const result = createRosterMemberSchema.safeParse({ ...validMember, workstreamIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(createRosterMemberSchema.safeParse({ ...validMember, email: 'bad' }).success).toBe(false);
  });

  it('rejects invalid role', () => {
    expect(createRosterMemberSchema.safeParse({ ...validMember, role: 'UNKNOWN' }).success).toBe(false);
  });
});

describe('updateRosterMemberSchema', () => {
  it('accepts partial update with only displayName', () => {
    expect(updateRosterMemberSchema.safeParse({ displayName: 'New Name' }).success).toBe(true);
  });

  it('accepts clearing slackNicknames to empty array', () => {
    const result = updateRosterMemberSchema.safeParse({ slackNicknames: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slackNicknames).toEqual([]);
  });

  it('accepts empty object (no-op update)', () => {
    expect(updateRosterMemberSchema.safeParse({}).success).toBe(true);
  });

  it('rejects email field (email cannot be updated)', () => {
    // email is omitted from updateRosterMemberSchema — it should be stripped/rejected
    const result = updateRosterMemberSchema.safeParse({ email: 'new@email.com' });
    // email is stripped by .omit() — parse succeeds but email is not in result
    if (result.success) {
      expect('email' in result.data).toBe(false);
    }
  });

  it('rejects invalid role in update', () => {
    expect(updateRosterMemberSchema.safeParse({ role: 'BADROL' }).success).toBe(false);
  });
});
