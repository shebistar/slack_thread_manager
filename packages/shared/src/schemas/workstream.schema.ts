import { z } from 'zod';

export const createWorkstreamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
});
export type CreateWorkstream = z.infer<typeof createWorkstreamSchema>;

export const updateWorkstreamSchema = createWorkstreamSchema.partial();
export type UpdateWorkstream = z.infer<typeof updateWorkstreamSchema>;

export const workstreamSchema = createWorkstreamSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type Workstream = z.infer<typeof workstreamSchema>;

export const userWorkstreamSchema = z.object({
  userId: z.string().uuid(),
  workstreamId: z.string().uuid(),
});
export type UserWorkstream = z.infer<typeof userWorkstreamSchema>;
