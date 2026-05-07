import { z } from 'zod';

export const UserRole = z.enum([
  'ARCHITECT',
  'PM',
  'CONSULTANT',
  'SALES',
  'TRAINING',
  'ADMIN',
]);
export type UserRole = z.infer<typeof UserRole>;

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  slackHandle: z.string().min(1).max(100),
  slackNicknames: z.array(z.string()).default([]),
  role: UserRole,
});
export type CreateUser = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().omit({ email: true });
export type UpdateUser = z.infer<typeof updateUserSchema>;

export const userSchema = createUserSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

// Roster-specific schemas (include workstream assignments)

export const createRosterMemberSchema = createUserSchema.extend({
  workstreamIds: z.array(z.string().uuid()).default([]),
});
export type CreateRosterMember = z.infer<typeof createRosterMemberSchema>;

export const updateRosterMemberSchema = createRosterMemberSchema
  .partial()
  .omit({ email: true })
  .extend({
    // Explicit nullable handling: passing [] clears all nicknames (resolves deferred-work from 1.2)
    slackNicknames: z.array(z.string()).optional(),
    workstreamIds: z.array(z.string().uuid()).optional(),
  });
export type UpdateRosterMember = z.infer<typeof updateRosterMemberSchema>;

export const rosterMemberSchema = userSchema.extend({
  workstreams: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .default([]),
});
export type RosterMember = z.infer<typeof rosterMemberSchema>;
