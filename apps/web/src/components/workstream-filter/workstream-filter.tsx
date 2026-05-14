interface WorkstreamFilterProps {
  workstreams: string[];
  selectedWorkstream: string | null;
  onSelect: (workstream: string | null) => void;
}

export function WorkstreamFilter({
  workstreams,
  selectedWorkstream,
  onSelect,
}: WorkstreamFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by workstream">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none ${
          selectedWorkstream === null
            ? 'bg-[--color-blue-50] text-white'
            : 'border border-[--color-gray-20] bg-white text-[--color-gray-95] hover:bg-[--color-gray-10]'
        }`}
        aria-pressed={selectedWorkstream === null}
      >
        All Workstreams
      </button>
      {workstreams.map((ws) => (
        <button
          key={ws}
          type="button"
          onClick={() => onSelect(ws)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none ${
            selectedWorkstream === ws
              ? 'bg-[--color-blue-50] text-white'
              : 'border border-[--color-gray-20] bg-white text-[--color-gray-95] hover:bg-[--color-gray-10]'
          }`}
          aria-pressed={selectedWorkstream === ws}
        >
          {ws}
        </button>
      ))}
    </div>
  );
}
