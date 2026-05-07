import { Badge } from '@/components/ui/badge.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';
import { LogOut } from 'lucide-react';

interface AppHeaderProps {
  user: AuthenticatedUser | null;
  onLogout?: () => void;
}

export function AppHeader({ user, onLogout }: AppHeaderProps) {
  return (
    <header className="w-full bg-white border-b border-[--color-gray-20]">
      <div className="flex items-center justify-between px-4 xl:px-8 h-14">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-[--color-brand-red] rounded-sm" />
          <span className="text-lg font-[--font-display] font-medium text-[--color-gray-95]">
            Slack Thread Manager
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span
            className="text-xs text-[--color-gray-50]"
            role="status"
            aria-label="Briefing freshness"
          >
            Briefing freshness unavailable
          </span>

          {user?.role && (
            <Badge variant="secondary" aria-label={`Role: ${user.role}`}>
              {user.role}
            </Badge>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 text-[--color-gray-50] hover:text-[--color-gray-95] rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--color-blue-50]"
              aria-label="Sign out"
              type="button"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
