import { useAuth } from './auth/index.js';

export default function App() {
  const { isLoading, isAuthenticated, user, logout } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-lg text-[--color-gray-50]">Authenticating…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-4xl font-medium text-[--color-gray-95]">Slack Thread Manager</h1>
        {isAuthenticated && user ? (
          <div className="mt-6 space-y-2">
            <p className="text-lg text-[--color-gray-50]">
              Welcome, <span className="font-semibold">{user.name}</span>
            </p>
            <p className="text-sm text-[--color-gray-50]">
              {user.email} · {user.role}
            </p>
            <button
              onClick={logout}
              className="mt-4 rounded-md bg-[--color-gray-95] px-4 py-2 text-sm text-white transition-colors hover:bg-[--color-gray-80]"
            >
              Sign out
            </button>
          </div>
        ) : (
          <p className="mt-4 text-lg text-[--color-gray-50]">
            Project intelligence platform — coming soon
          </p>
        )}
      </div>
    </main>
  );
}
