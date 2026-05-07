import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('renders the application heading with authenticated user', async () => {
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
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByText('Slack Thread Manager')).toBeInTheDocument();
    expect(await screen.findByText(/Welcome/)).toBeInTheDocument();
    expect(await screen.findByText(/Shebi/)).toBeInTheDocument();
  });

  it('shows authenticating state while loading', () => {
    mockKc.init.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(screen.getByText('Authenticating…')).toBeInTheDocument();
  });
});
