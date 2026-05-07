import type { AuthenticatedUser, UserRole } from '@slack-thread-manager/shared';

export type LayoutVariant = 'dashboard' | 'feed' | 'split-panel';

const ROLE_LAYOUT_MAP: Record<UserRole, LayoutVariant> = {
  PM: 'feed',
  SALES: 'dashboard',
  TRAINING: 'dashboard',
  ARCHITECT: 'split-panel',
  CONSULTANT: 'split-panel',
  ADMIN: 'dashboard',
};

export function hasRole(
  user: AuthenticatedUser | null,
  ...roles: UserRole[]
): boolean {
  if (!user?.role) return false;
  return roles.includes(user.role as UserRole);
}

export function isAdmin(user: AuthenticatedUser | null): boolean {
  return hasRole(user, 'ADMIN');
}

export function getLayoutVariant(role: UserRole): LayoutVariant {
  return ROLE_LAYOUT_MAP[role] ?? 'dashboard';
}
