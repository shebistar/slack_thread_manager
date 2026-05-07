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
