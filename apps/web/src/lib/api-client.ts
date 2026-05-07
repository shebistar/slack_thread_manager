import keycloak from '../auth/keycloak.js';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function getHeaders(): Promise<HeadersInit> {
  if (keycloak.isTokenExpired(10)) {
    await keycloak.updateToken(30);
  }
  return {
    'Content-Type': 'application/json',
    ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getHeaders();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    keycloak.login();
    throw new Error('Unauthorized — redirecting to login');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
