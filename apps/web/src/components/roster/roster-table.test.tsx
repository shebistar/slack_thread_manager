import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RosterTable } from './roster-table.js';
import type { RosterMember } from '@slack-thread-manager/shared';

const member1: RosterMember = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  email: 'alice@example.com',
  displayName: 'Alice',
  slackHandle: 'alice',
  slackNicknames: [],
  role: 'ARCHITECT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workstreams: [{ id: 'w1', name: 'Platform' }],
};

const member2: RosterMember = {
  id: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
  email: 'bob@example.com',
  displayName: 'Bob',
  slackHandle: 'bob',
  slackNicknames: [],
  role: 'PM',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  workstreams: [],
};

const defaultProps = {
  members: [member1, member2],
  isLoading: false,
  error: null,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RosterTable', () => {
  it('renders member rows', () => {
    render(<RosterTable {...defaultProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('renders loading skeleton rows when isLoading is true', () => {
    render(<RosterTable {...defaultProps} isLoading members={[]} />);
    // 3 skeleton rows × 6 cells each = 18 skeleton elements
    const skeletons = document.querySelectorAll('.animate-pulse, [class*="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error message when error is provided', () => {
    render(
      <RosterTable {...defaultProps} members={[]} error={new Error('Network error')} />,
    );
    expect(screen.getByText(/Failed to load roster: Network error/)).toBeInTheDocument();
  });

  it('sort toggle changes display order on column header click', () => {
    render(<RosterTable {...defaultProps} />);
    const nameHeader = screen.getByText('Display Name');
    // Default is asc — Alice first
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Alice');
    // Click to toggle desc — Bob first
    fireEvent.click(nameHeader);
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Bob');
  });

  it('calls onEdit when Edit button is clicked', () => {
    render(<RosterTable {...defaultProps} />);
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    expect(defaultProps.onEdit).toHaveBeenCalledWith(member1);
  });

  it('shows remove confirmation dialog when Remove is clicked', async () => {
    render(<RosterTable {...defaultProps} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Remove team member')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to remove/)).toBeInTheDocument();
    });
  });

  it('calls onDelete with member id on confirmation', async () => {
    render(<RosterTable {...defaultProps} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]);
    await waitFor(() =>
      screen.getByText('Remove team member'),
    );
    // Click the action button in the dialog
    const confirmButtons = screen.getAllByRole('button', { name: 'Remove' });
    // The last Remove button in the dialog is the confirm button
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(defaultProps.onDelete).toHaveBeenCalledWith(member1.id);
  });
});
