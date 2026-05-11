import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

vi.mock('./auth/keycloak.js', () => ({
  default: {
    init: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    token: undefined as string | undefined,
    isTokenExpired: vi.fn(() => false),
    updateToken: vi.fn(),
    onTokenExpired: undefined as (() => void) | undefined,
  },
}));

vi.mock('./hooks/use-briefings.js', () => ({
  useTodayBriefing: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import keycloak from './auth/keycloak.js';
import { AuthProvider } from './auth/index.js';
import App from './app.js';

const mockKc = keycloak as unknown as {
  init: ReturnType<typeof vi.fn>;
  token: string | undefined;
};

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKc.token = undefined;
  });

  it('shows authenticating state while loading', () => {
    mockKc.init.mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Authenticating…')).toBeInTheDocument();
  });

  it('renders briefings route when authenticated (index redirects to /briefings)', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u1',
        email: 'shebi@test.com',
        name: 'Shebi',
        role: 'ADMIN',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Your first briefing hasn't been generated yet."),
    ).toBeInTheDocument();
  });

  it('renders app header with role badge when authenticated', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u1',
        email: 'shebi@test.com',
        name: 'Shebi',
        role: 'ADMIN',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    const headings = await screen.findAllByText('Slack Thread Manager');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('ADMIN')).toBeInTheDocument();
  });

  it('renders navigation bar with Briefing and Search for all users', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u1',
        email: 'shebi@test.com',
        name: 'Shebi',
        role: 'ARCHITECT',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Briefing')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders Admin nav item only for ADMIN role', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u1',
        email: 'shebi@test.com',
        name: 'Shebi',
        role: 'ADMIN',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Admin')).toBeInTheDocument();
  });

  it('hides Admin nav item for non-ADMIN role', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u2',
        email: 'alex@test.com',
        name: 'Alex',
        role: 'CONSULTANT',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await screen.findByText('Briefing');
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('renders skip-to-content link', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u1',
        email: 'shebi@test.com',
        name: 'Shebi',
        role: 'ADMIN',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await screen.findByText('Briefing');
    expect(screen.getByText('Skip to content')).toBeInTheDocument();
  });

  it('updates page title to Daily Briefing on briefings route', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u1',
        email: 'shebi@test.com',
        name: 'Shebi',
        role: 'ADMIN',
      });
      return true;
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("Your first briefing hasn't been generated yet.");
    await waitFor(() => {
      expect(document.title).toBe('Daily Briefing — Slack Thread Manager');
    });
  });
});

describe('Admin route guard', () => {
  function createTestRouter(user: AuthenticatedUser | null, initialPath: string) {
    const rootRoute = createRootRouteWithContext<{
      user: AuthenticatedUser | null;
      isAuthenticated: boolean;
    }>()({
      component: Outlet,
    });

    const adminRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/admin',
      beforeLoad: ({ context }) => {
        if (!context.user || context.user.role !== 'ADMIN') {
          throw redirect({ to: '/access-denied' });
        }
      },
      component: () => <div>Admin Panel</div>,
    });

    const accessDeniedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/access-denied',
      component: () => <div>Access Denied</div>,
    });

    const briefingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/briefings',
      component: () => <div>Briefings</div>,
    });

    const routeTree = rootRoute.addChildren([
      adminRoute,
      accessDeniedRoute,
      briefingsRoute,
    ]);

    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [initialPath] }),
      context: {
        user,
        isAuthenticated: !!user,
      },
    });
  }

  it('allows ADMIN user to access admin route', async () => {
    const adminUser: AuthenticatedUser = {
      sub: 'u1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'ADMIN',
    };

    const testRouter = createTestRouter(adminUser, '/admin');

    render(<RouterProvider router={testRouter} />);

    expect(await screen.findByText('Admin Panel')).toBeInTheDocument();
  });

  it('blocks non-ADMIN user from admin route via redirect', async () => {
    const consultantUser: AuthenticatedUser = {
      sub: 'u2',
      email: 'user@test.com',
      name: 'Consultant',
      role: 'CONSULTANT',
    };

    const testRouter = createTestRouter(consultantUser, '/admin');

    render(<RouterProvider router={testRouter} />);

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('blocks null user from admin route via redirect', async () => {
    const testRouter = createTestRouter(null, '/admin');

    render(<RouterProvider router={testRouter} />);

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });
});
