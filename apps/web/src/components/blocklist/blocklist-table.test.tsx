import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocklistTable } from './blocklist-table.js';
import type { BlocklistEntryResponse } from '@slack-thread-manager/shared';

const entry1: BlocklistEntryResponse = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  term: 'Acme Corp',
  replacement: '[COMPANY]',
  category: 'company_name',
  createdAt: '2026-05-01T10:00:00.000Z',
};

const entry2: BlocklistEntryResponse = {
  id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567891',
  term: 'john.doe@example.com',
  replacement: '[EMAIL]',
  category: 'person_name',
  createdAt: '2026-05-02T10:00:00.000Z',
};

const defaultProps = {
  entries: [entry1, entry2],
  isLoading: false,
  error: null,
  search: '',
  onSearchChange: vi.fn(),
  categoryFilter: undefined as undefined,
  onCategoryFilterChange: vi.fn(),
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
  onSortChange: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BlocklistTable', () => {
  it('renders entry rows with all columns', () => {
    render(<BlocklistTable {...defaultProps} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('[COMPANY]')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('[EMAIL]')).toBeInTheDocument();
    expect(screen.getByText('Person')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<BlocklistTable {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search terms…')).toBeInTheDocument();
  });

  it('calls onSearchChange when typing in search', () => {
    render(<BlocklistTable {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText('Search terms…');
    fireEvent.change(searchInput, { target: { value: 'acme' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('acme');
  });

  it('calls onSortChange when clicking sortable column headers', () => {
    render(<BlocklistTable {...defaultProps} />);
    fireEvent.click(screen.getByText('Term'));
    expect(defaultProps.onSortChange).toHaveBeenCalledWith('term', 'asc');
  });

  it('toggles sort direction when clicking the currently sorted column', () => {
    render(<BlocklistTable {...defaultProps} sortBy="term" sortOrder="asc" />);
    fireEvent.click(screen.getByText('Term'));
    expect(defaultProps.onSortChange).toHaveBeenCalledWith('term', 'desc');
  });

  it('calls onEdit when Edit button is clicked', () => {
    render(<BlocklistTable {...defaultProps} />);
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    expect(defaultProps.onEdit).toHaveBeenCalledWith(entry1);
  });

  it('shows remove confirmation dialog and calls onDelete on confirm', async () => {
    render(<BlocklistTable {...defaultProps} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Remove blocklist entry')).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  it('shows empty state when no entries', () => {
    render(<BlocklistTable {...defaultProps} entries={[]} />);
    expect(
      screen.getByText(/No blocklist entries found/),
    ).toBeInTheDocument();
  });

  it('shows error state when error is provided', () => {
    render(
      <BlocklistTable
        {...defaultProps}
        error={new Error('Network error')}
      />,
    );
    expect(screen.getByText(/Failed to load blocklist/)).toBeInTheDocument();
  });

  it('shows loading skeletons when isLoading is true', () => {
    const { container } = render(<BlocklistTable {...defaultProps} isLoading={true} entries={[]} />);
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
