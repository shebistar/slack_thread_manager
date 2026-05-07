import { Link, useRouterState } from '@tanstack/react-router';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';
import { isAdmin } from '@/lib/role-layout.js';

interface NavBarProps {
  user: AuthenticatedUser | null;
}

const NAV_ITEMS = [
  { to: '/briefings', label: 'Briefing' },
  { to: '/search', label: 'Search' },
] as const;

export function NavBar({ user }: NavBarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <nav
      className="w-full bg-[--color-gray-95]"
      aria-label="Main navigation"
    >
      <div className="flex items-center gap-1 px-4 xl:px-8 h-11">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            label={item.label}
            isActive={currentPath.startsWith(item.to)}
          />
        ))}
        {isAdmin(user) && (
          <NavLink
            to="/admin"
            label="Admin"
            isActive={currentPath.startsWith('/admin')}
          />
        )}
        <div className="flex-1" />
        <NavLink
          to="/help"
          label="Help"
          isActive={currentPath.startsWith('/help')}
        />
      </div>
    </nav>
  );
}

function NavLink({
  to,
  label,
  isActive,
}: {
  to: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      className={`px-3 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--color-blue-50] ${
        isActive
          ? 'text-white border-b-2 border-[--color-brand-red]'
          : 'text-[--color-gray-30] hover:text-white'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}
