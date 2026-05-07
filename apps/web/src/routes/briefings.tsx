import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/briefings')({
  component: BriefingsPage,
});

function BriefingsPage() {
  useEffect(() => {
    document.title = 'Daily Briefing — Slack Thread Manager';
  }, []);

  return (
    <div>
      <h1 className="sr-only">Daily Briefing</h1>
      <div className="flex items-center justify-center py-24">
        <p className="text-lg text-[--color-gray-50]">
          Your first briefing hasn't been generated yet.
        </p>
      </div>
    </div>
  );
}
