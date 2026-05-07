import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/access-denied')({
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  useEffect(() => {
    document.title = 'Access Denied — Slack Thread Manager';
  }, []);

  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <h1 className="text-2xl font-medium text-[--color-gray-95]">
          Access Denied
        </h1>
        <p className="mt-2 text-[--color-gray-50]">
          You do not have permission to access this page.
        </p>
        <Link
          to="/briefings"
          className="mt-4 inline-block text-[--color-blue-50] hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--color-blue-50] rounded-sm"
        >
          Return to Briefings
        </Link>
      </div>
    </div>
  );
}
