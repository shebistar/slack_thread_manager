import { RouterProvider } from '@tanstack/react-router';
import { useAuth } from './auth/index.js';
import { router } from './router.js';

export default function App() {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-lg text-[--color-gray-50]">Authenticating…</p>
      </main>
    );
  }

  return (
    <RouterProvider router={router} context={{ user, isAuthenticated }} />
  );
}
