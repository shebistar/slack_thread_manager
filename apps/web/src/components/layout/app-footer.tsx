import { Link } from '@tanstack/react-router';

export function AppFooter() {
  return (
    <footer className="w-full border-t border-[--color-gray-20] bg-white">
      <div className="flex items-center justify-between px-4 xl:px-8 h-10 text-xs text-[--color-gray-50]">
        <span>Slack Thread Manager</span>
        <div className="flex items-center gap-4">
          <Link
            to="/help"
            className="hover:text-[--color-gray-95] transition-colors"
          >
            Help
          </Link>
          <span>v{__APP_VERSION__}</span>
        </div>
      </div>
    </footer>
  );
}
