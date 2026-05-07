import type { UserRole } from '../schemas/user.schema.js';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}
