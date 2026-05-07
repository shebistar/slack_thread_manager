import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./keycloak.js', () => ({
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

import keycloak from './keycloak.js';
import { AuthProvider } from './auth-context.js';
import { useAuth } from './use-auth.js';

const mockKc = keycloak as unknown as {
  init: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  token: string | undefined;
  onTokenExpired: (() => void) | undefined;
};

function TestConsumer() {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <div>loading</div>;
  if (!isAuthenticated) return <div>not authenticated</div>;
  return (
    <div>
      <span data-testid="name">{user?.name}</span>
      <span data-testid="role">{user?.role}</span>
    </div>
  );
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKc.token = undefined;
    mockKc.onTokenExpired = undefined;
  });

  it('shows loading state initially and resolves to authenticated', async () => {
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
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('Shebi');
      expect(screen.getByTestId('role')).toHaveTextContent('ADMIN');
    });
  });

  it('shows not authenticated when init returns false', async () => {
    mockKc.init.mockResolvedValue(false);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('not authenticated')).toBeInTheDocument();
    });
  });

  it('handles init failure gracefully', async () => {
    mockKc.init.mockRejectedValue(new Error('network'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('not authenticated')).toBeInTheDocument();
    });
  });

  it('uses preferred_username as fallback and CONSULTANT as default role', async () => {
    mockKc.init.mockImplementation(async () => {
      mockKc.token = makeJwt({
        sub: 'u2',
        email: 'test@test.com',
        preferred_username: 'test.user',
      });
      return true;
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('test.user');
      expect(screen.getByTestId('role')).toHaveTextContent('CONSULTANT');
    });
  });
});
