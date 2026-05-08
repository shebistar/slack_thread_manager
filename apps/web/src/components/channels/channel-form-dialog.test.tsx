import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChannelFormDialog } from './channel-form-dialog.js';
import type { ChannelWithWorkstream } from '@/hooks/use-channels.js';
import type { Workstream } from '@slack-thread-manager/shared';

const mockWorkstream: Workstream = {
  id: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
  name: 'Platform',
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockChannel: ChannelWithWorkstream = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  slackChannelId: 'C01ABC123',
  name: 'vm-migration-general',
  workstreamId: mockWorkstream.id,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  workstreamName: 'Platform',
};

describe('ChannelFormDialog — create mode', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    workstreams: [mockWorkstream],
    onSubmitCreate: vi.fn().mockResolvedValue({}),
  };

  it('renders all fields', () => {
    render(<ChannelFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Slack Channel ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Channel Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Workstream (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Channel' })).toBeInTheDocument();
  });

  it('Slack Channel ID is enabled in create mode', () => {
    render(<ChannelFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Slack Channel ID')).not.toBeDisabled();
  });

  it('shows validation error for invalid Slack Channel ID on submit', async () => {
    render(<ChannelFormDialog {...defaultProps} />);

    const slackIdInput = screen.getByLabelText('Slack Channel ID');
    fireEvent.change(slackIdInput, { target: { value: 'invalid' } });

    const nameInput = screen.getByLabelText('Channel Name');
    fireEvent.change(nameInput, { target: { value: 'test-channel' } });

    const submitBtn = screen.getByRole('button', { name: 'Add Channel' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid Slack channel ID format/),
      ).toBeInTheDocument();
    });

    expect(defaultProps.onSubmitCreate).not.toHaveBeenCalled();
  });

});


describe('ChannelFormDialog — edit mode', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    channel: mockChannel,
    workstreams: [mockWorkstream],
    onSubmitUpdate: vi.fn().mockResolvedValue({}),
  };

  it('Slack Channel ID is disabled in edit mode', () => {
    render(<ChannelFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Slack Channel ID')).toBeDisabled();
  });

  it('pre-fills form with channel data', () => {
    render(<ChannelFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Slack Channel ID')).toHaveValue('C01ABC123');
    expect(screen.getByLabelText('Channel Name')).toHaveValue('vm-migration-general');
  });

  it('shows Save Changes button in edit mode', () => {
    render(<ChannelFormDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('shows conflict error message on 409', async () => {
    const onSubmitUpdate = vi
      .fn()
      .mockRejectedValue(new Error('API 409: conflict'));

    render(
      <ChannelFormDialog {...defaultProps} onSubmitUpdate={onSubmitUpdate} />,
    );

    const submitBtn = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('A channel with this Slack ID already exists'),
      ).toBeInTheDocument();
    });
  });
});
