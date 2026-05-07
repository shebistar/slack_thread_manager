import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/search')({
  component: SearchPage,
});

function SearchPage() {
  useEffect(() => {
    document.title = 'Search — Slack Thread Manager';
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="text-2xl font-medium text-[--color-gray-95] mb-6">
        Search
      </h1>
      <div className="relative">
        <input
          type="text"
          placeholder="Ask a question about project discussions..."
          className="w-full px-4 py-3 border border-[--color-gray-20] rounded-lg text-sm text-[--color-gray-95] placeholder:text-[--color-gray-50] focus:outline-none focus:ring-2 focus:ring-[--color-blue-50] focus:border-transparent"
          disabled
          aria-label="Search project discussions"
        />
      </div>
      <p className="mt-4 text-sm text-[--color-gray-50]">
        Search functionality coming soon.
      </p>
    </div>
  );
}
