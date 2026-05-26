import { useId, useState } from 'react';
import { useEnrichment } from '@/hooks/use-enrichment.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import type { EnrichmentSection, EnrichmentSourceType } from '@slack-thread-manager/shared';

interface EnrichmentPanelProps {
  threadId: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

const SECTION_CONFIG: Array<{
  sourceType: EnrichmentSourceType;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    sourceType: 'OPENSHIFT_DOCS',
    label: 'OpenShift Documentation',
    icon: <BookIcon />,
  },
  {
    sourceType: 'NOTEBOOKLM',
    label: 'Knowledge Base (NotebookLM)',
    icon: <LightbulbIcon />,
  },
  {
    sourceType: 'PAST_DISCUSSION',
    label: 'Similar Past Discussions',
    icon: <ChatIcon />,
  },
];

export function EnrichmentPanel({ threadId, isOpen, onToggle }: EnrichmentPanelProps) {
  const { data, isLoading, isError } = useEnrichment(threadId);

  return (
    <div
      className={`shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none xl:relative ${
        isOpen ? 'xl:w-[360px]' : 'xl:w-[40px]'
      }`}
    >
      <div className={`bg-[--color-blue-10] rounded-lg border border-[--color-gray-20] ${isOpen ? '' : 'xl:h-full'}`}>
        <div className="hidden xl:flex items-center justify-end p-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label="Toggle side panel"
            className="p-1 rounded hover:bg-[--color-gray-20] focus-visible:ring-2 focus-visible:ring-[--color-blue-50] focus-visible:outline-none"
          >
            <svg
              className={`w-5 h-5 text-[--color-gray-50] transition-transform duration-200 ease-out motion-reduce:transition-none ${isOpen ? '' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className={`p-4 pt-0 xl:pt-0 ${isOpen ? '' : 'xl:hidden'}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 bg-[--color-teal-50] text-white rounded text-[10px] font-medium">
              AI-Assisted
            </span>
            <h4 className="text-sm font-medium text-[--color-gray-95]">Related Context</h4>
          </div>

          <PanelContent
            threadId={threadId}
            data={data}
            isLoading={isLoading}
            isError={isError}
          />
        </div>
      </div>
    </div>
  );
}

function PanelContent({
  threadId,
  data,
  isLoading,
  isError,
}: {
  threadId: string | null;
  data: Awaited<ReturnType<typeof useEnrichment>['data']>;
  isLoading: boolean;
  isError: boolean;
}) {
  if (!threadId) {
    return (
      <div className="text-center py-8">
        <span className="text-2xl" aria-hidden="true">←</span>
        <p className="text-sm text-[--color-gray-50] mt-2">
          Select a topic card to see related context
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-[--color-gray-50]">
          Enrichment temporarily unavailable
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <EnrichmentSkeleton />;
  }

  if (!data || data.sections.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-[--color-gray-50]">
          No related context found for this topic
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {SECTION_CONFIG.map((config) => {
        const sectionItems = data.sections.filter(
          (s) => s.sourceType === config.sourceType,
        );
        return (
          <CollapsibleSection
            key={config.sourceType}
            label={config.label}
            icon={config.icon}
            items={sectionItems}
            sourceType={config.sourceType}
          />
        );
      })}
    </div>
  );
}

function CollapsibleSection({
  label,
  icon,
  items,
  sourceType,
}: {
  label: string;
  icon: React.ReactNode;
  items: EnrichmentSection[];
  sourceType: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  const buttonId = `${id}-btn`;
  const panelId = `${id}-panel`;

  const hasItems = items.length > 0;

  return (
    <div className="bg-white rounded-md border border-[--color-gray-20] overflow-hidden">
      <h5>
        <button
          id={buttonId}
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[--color-gray-10] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[--color-blue-50] focus-visible:outline-none"
        >
          <span className="text-[--color-gray-50]" aria-hidden="true">{icon}</span>
          <span className="text-xs font-medium text-[--color-gray-95] flex-1">{label}</span>
          {hasItems && (
            <span className="text-[10px] text-[--color-gray-30] bg-[--color-gray-10] px-1.5 py-0.5 rounded">
              {items.length} {items.length === 1 ? 'result' : 'results'}
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-[--color-gray-30] transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h5>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!expanded}
        className={expanded ? '' : 'hidden'}
      >
        {hasItems ? (
          <div className="px-3 pb-3 space-y-2.5">
            {items.map((item, idx) => (
              <EnrichmentLink key={`${sourceType}-${idx}`} item={item} icon={icon} />
            ))}
          </div>
        ) : (
          <div className="px-3 pb-3">
            <p className="text-xs text-[--color-gray-50] italic">
              Source temporarily unavailable
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function EnrichmentLink({ item, icon }: { item: EnrichmentSection; icon: React.ReactNode }) {
  return (
    <div className="group">
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13px] font-medium text-[--color-blue-50] hover:underline focus-visible:ring-2 focus-visible:ring-[--color-blue-50] rounded outline-none"
      >
        {item.title}
      </a>
      <p className="text-[12px] text-[--color-gray-50] line-clamp-2 mt-0.5">
        {item.description}
      </p>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="w-3 h-3 text-[--color-gray-30]" aria-hidden="true">{icon}</span>
        <span className="text-[11px] text-[--color-gray-30]">
          {item.sourceType === 'OPENSHIFT_DOCS' && 'OpenShift Docs'}
          {item.sourceType === 'NOTEBOOKLM' && 'Knowledge Base'}
          {item.sourceType === 'PAST_DISCUSSION' && 'Past Discussion'}
        </span>
      </div>
    </div>
  );
}

function EnrichmentSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="bg-white rounded-md border border-[--color-gray-20] p-3 space-y-2.5">
          <Skeleton className="h-3 w-2/3" />
          {Array.from({ length: 3 }).map((_, linkIdx) => (
            <div key={linkIdx} className="space-y-1">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BookIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
