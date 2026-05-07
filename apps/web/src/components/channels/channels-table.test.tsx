import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelsTable } from './channels-table.js';
import type { ChannelWithWorkstream } from '@/hooks/use-channels.js';

const channel1: ChannelWithWorkstream = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  slackChannelId: 'C01ABC123',
  name: 'vm-migration-general',
  workstreamId: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  workstreamName: 'Platform',
};

const channel2: ChannelWithWorkstream = {
  id: 'b47ac10b-58cc-4372-a567-0e02b2c3d479',
  slackChannelId: 'G02DEF456',
  name: 'networking-issues',
  workstreamId: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
  isActive: false,
  createdAt: '2026-01-02T00:00:00.000Z',
  workstreamName: 'Infrastructure',
};

const defaultProps = {
  channels: [channel1, channel2],
  isLoading: false,
  error: null,
  onEdit: vi.fn(),
  onToggle: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChannelsTable', () => {
  it('renders channel rows with all columns', () => {
    render(<ChannelsTable {...defaultProps} />);
    expect(screen.getByText('vm-migration-general')).toBeInTheDocument();
    expect(screen.getByText('C01ABC123')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Active badge for active channels and Inactive for inactive', () => {
    render(<ChannelsTable {...defaultProps} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows Deactivate for active channels and Activate for inactive', () => {
    render(<ChannelsTable {...defaultProps} />);
    expect(screen.getByText('Deactivate')).toBeInTheDocument();
    expect(screen.getByText('Activate')).toBeInTheDocument();
  });

  it('sort toggle changes display order on column header click', () => {
    render(<ChannelsTable {...defaultProps} />);
    const nameHeader = screen.getByText('Channel Name');
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('networking-issues');

    fireEvent.click(nameHeader);
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('vm-migration-general');
  });

  it('calls onEdit when Edit button is clicked', () => {
    render(<ChannelsTable {...defaultProps} />);
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    expect(defaultProps.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ slackChannelId: 'G02DEF456' }),
    );
  });

  it('calls onToggle when toggle button is clicked', () => {
    render(<ChannelsTable {...defaultProps} />);
    const deactivateBtn = screen.getByText('Deactivate');
    fireEvent.click(deactivateBtn);
    expect(defaultProps.onToggle).toHaveBeenCalledWith(channel1.id);
  });

  it('shows remove confirmation dialog and calls onDelete on confirm', async () => {
    render(<ChannelsTable {...defaultProps} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Remove channel')).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  it('shows empty state when no channels', () => {
    render(<ChannelsTable {...defaultProps} channels={[]} />);
    expect(
      screen.getByText(/No channels configured yet/),
    ).toBeInTheDocument();
  });

  it('shows error state when error is provided', () => {
    render(
      <ChannelsTable
        {...defaultProps}
        error={new Error('Network error')}
      />,
    );
    expect(screen.getByText(/Failed to load channels/)).toBeInTheDocument();
  });
});
