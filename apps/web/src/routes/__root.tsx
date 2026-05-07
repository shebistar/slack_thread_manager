import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';
import { AppHeader } from '@/components/layout/app-header.js';
import { AppFooter } from '@/components/layout/app-footer.js';
import { NavBar } from '@/components/layout/nav-bar.js';
import { useAuth } from '@/auth/index.js';
import { Toaster } from '@/components/ui/sonner.js';

export interface RouterContext {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { user } = Route.useRouteContext();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-[--color-gray-10]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-[--color-blue-50] focus:underline"
      >
        Skip to content
      </a>
      <AppHeader user={user} onLogout={logout} />
      <NavBar user={user} />
      <main
        id="main-content"
        className="flex-1 w-full max-w-7xl mx-auto px-4 xl:px-8 py-6"
      >
        <Outlet />
      </main>
      <AppFooter />
      <Toaster />
    </div>
  );
}
