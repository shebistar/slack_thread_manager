import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StagingReviewItem } from './staging-review-item.js';
import type { StagingQueueItem } from '@slack-thread-manager/shared';

const baseSummary = {
  headline: 'Test',
  body: 'Some content with Acme Corp mentioned',
  key_decisions: [],
  action_items: [],
};

const cleanItem: StagingQueueItem = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  threadId: 'thread-1',
  batchId: 'batch-1',
  status: 'pending',
  createdAt: '2026-05-01T10:00:00.000Z',
  reviewedAt: null,
  reviewedBy: null,
  workstream: { id: 'ws-1', name: 'Platform' },
  flags: [],
  originalContent: { technicalSummary: baseSummary, plainSummary: baseSummary },
  anonymizedContent: { technicalSummary: baseSummary, plainSummary: baseSummary },
};

const flaggedItem: StagingQueueItem = {
  ...cleanItem,
  id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567891',
  flags: [
    {
      term: 'Acme Corp',
      replacement: '[COMPANY]',
      category: 'company_name',
      source: 'BLOCKLIST',
      positions: [{ field: 'plainSummary.body', startIndex: 18, endIndex: 27 }],
    },
    {
      term: 'Jane Smith',
      replacement: '[PERSON]',
      category: 'person_name',
      source: 'LLM',
      confidence: 0.92,
    },
  ],
};

const defaultProps = {
  item: cleanItem,
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onAddToBlocklist: vi.fn(),
  isReviewing: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StagingReviewItem', () => {
  it('renders approve and reject buttons', () => {
    render(<StagingReviewItem {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('calls onApprove when approve is clicked', () => {
    render(<StagingReviewItem {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(defaultProps.onApprove).toHaveBeenCalledWith(cleanItem.id);
  });

  it('calls onReject when reject is clicked', () => {
    render(<StagingReviewItem {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(defaultProps.onReject).toHaveBeenCalledWith(cleanItem.id);
  });

  it('disables buttons when isReviewing is true', () => {
    render(<StagingReviewItem {...defaultProps} isReviewing={true} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('does not show Flagged badge for clean items', () => {
    render(<StagingReviewItem {...defaultProps} />);
    expect(screen.queryByText('Flagged')).not.toBeInTheDocument();
  });

  it('shows Flagged badge for flagged items', () => {
    render(<StagingReviewItem {...defaultProps} item={flaggedItem} />);
    expect(screen.getByText('Flagged')).toBeInTheDocument();
  });

  it('shows workstream badge', () => {
    render(<StagingReviewItem {...defaultProps} />);
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('shows flag details for flagged items', () => {
    render(<StagingReviewItem {...defaultProps} item={flaggedItem} />);
    expect(screen.getByText('Blocklist match')).toBeInTheDocument();
    expect(screen.getByText('LLM entity detection')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('shows Add to Blocklist button only for LLM-detected entities', () => {
    render(<StagingReviewItem {...defaultProps} item={flaggedItem} />);
    const addButtons = screen.getAllByRole('button', { name: /Add to Blocklist/ });
    expect(addButtons).toHaveLength(1);
  });

  it('calls onAddToBlocklist with correct prefill data', () => {
    render(<StagingReviewItem {...defaultProps} item={flaggedItem} />);
    const addButton = screen.getByRole('button', { name: /Add to Blocklist/ });
    fireEvent.click(addButton);
    expect(defaultProps.onAddToBlocklist).toHaveBeenCalledWith({
      term: 'Jane Smith',
      category: 'person_name',
      replacement: '[PERSON]',
    });
  });

  it('does not show Add to Blocklist when callback is not provided', () => {
    render(
      <StagingReviewItem
        item={flaggedItem}
        onApprove={defaultProps.onApprove}
        onReject={defaultProps.onReject}
        isReviewing={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /Add to Blocklist/ })).not.toBeInTheDocument();
  });
});
