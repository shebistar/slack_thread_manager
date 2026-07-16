import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportForm } from './import-form.js';
import type { ChannelWithWorkstream } from '@/hooks/use-channels.js';

const mutateAsync = vi.fn();

let mockChannels: ChannelWithWorkstream[] = [];
let mockChannelsLoading = false;

vi.mock('@/hooks/use-channels.js', () => ({
  useChannels: vi.fn(() => ({
    data: mockChannels,
    isLoading: mockChannelsLoading,
  })),
}));

vi.mock('@/hooks/use-import.js', () => ({
  useImportHistory: vi.fn(() => ({
    mutateAsync,
    isPending: false,
    reset: vi.fn(),
  })),
}));

vi.mock('@/lib/slack-text-parser.js', () => ({
  parseSlackText: vi.fn((text: string) => {
    if (!text.trim()) return [];
    if (text.includes('VALID_MSG')) {
      return [
        { ts: '1.000', user: 'Alice', text: 'hello', type: 'message' },
        { ts: '2.000', user: 'Bob', text: 'world', type: 'message' },
      ];
    }
    return [];
  }),
}));

const channelA: ChannelWithWorkstream = {
  id: 'ch-1',
  slackChannelId: 'C111',
  name: 'ops',
  workstreamId: 'ws-1',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  workstreamName: 'Ops',
};

const channelB: ChannelWithWorkstream = {
  id: 'ch-2',
  slackChannelId: 'C222',
  name: 'dev',
  workstreamId: 'ws-2',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  workstreamName: 'Dev',
};

describe('ImportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockChannels = [];
    mockChannelsLoading = false;
    mutateAsync.mockResolvedValue({
      threadsFound: 1,
      threadsStored: 1,
      messagesStored: 2,
      skipped: 0,
      errors: 0,
    });
  });

  it('auto-selects a single active channel and shows a read-only label', async () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    await waitFor(() => {
      expect(screen.getByTestId('channel-readonly')).toBeDefined();
    });
    expect(screen.getByTestId('channel-readonly').textContent).toContain('#ops');
    expect(screen.queryByTestId('channel-select')).toBeNull();
  });

  it('defaults to the first channel when multiple active channels exist', async () => {
    mockChannels = [channelA, channelB];
    render(<ImportForm />);

    await waitFor(() => {
      expect(screen.getByTestId('channel-select')).toBeDefined();
    });
    expect(screen.queryByTestId('channel-readonly')).toBeNull();
    // Channel is selected in state — validation should not ask for channel
    expect(screen.queryByText('Select a target channel above')).toBeNull();
  });

  it('pre-fills Team ID from localStorage and collapses the field', () => {
    localStorage.setItem('stm-last-team-id', 'T99SAVED');
    mockChannels = [channelA];
    render(<ImportForm />);

    expect(screen.getByTestId('team-id-collapsed')).toBeDefined();
    expect(screen.getByText('T99SAVED')).toBeDefined();
    expect(screen.queryByTestId('team-id-input')).toBeNull();
  });

  it('shows Team ID input prominently when no saved value exists', () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    expect(screen.getByTestId('team-id-input')).toBeDefined();
    expect(screen.queryByTestId('team-id-collapsed')).toBeNull();
  });

  it('expands Team ID field when Change is clicked', () => {
    localStorage.setItem('stm-last-team-id', 'T99SAVED');
    mockChannels = [channelA];
    render(<ImportForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByTestId('team-id-input')).toBeDefined();
    expect((screen.getByTestId('team-id-input') as HTMLInputElement).value).toBe('T99SAVED');
  });

  it('keeps the submit button visible when disabled', () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    const button = screen.getByTestId('import-submit');
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className).toContain('bg-[--color-gray-20]');
    expect(button.className).toContain('disabled:opacity-100');
  });

  it('shows validation messages for missing Team ID and paste text', async () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    await waitFor(() => {
      expect(screen.queryByText('Select a target channel above')).toBeNull();
    });
    expect(screen.getByText('Enter your Slack Team ID')).toBeDefined();
    expect(screen.getByText('Paste messages from Slack above')).toBeDefined();
  });

  it('updates submit label to Import N messages when messages are detected', async () => {
    localStorage.setItem('stm-last-team-id', 'T01ABC');
    mockChannels = [channelA];
    render(<ImportForm />);

    const textarea = screen.getByLabelText('Paste Messages from Slack');
    fireEvent.change(textarea, { target: { value: 'VALID_MSG content here' } });

    expect(screen.getByTestId('import-submit').textContent).toBe('Import 2 messages');
    expect(screen.getByTestId('parse-preview-success').textContent).toContain('2 messages detected');
  });

  it('shows a warning when pasted text yields zero messages', () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    fireEvent.change(screen.getByLabelText('Paste Messages from Slack'), {
      target: { value: 'not a slack message format' },
    });

    expect(screen.getByTestId('parse-preview-warning')).toBeDefined();
    expect(screen.getByTestId('import-submit').textContent).toBe('Import History');
  });

  it('hides validation messages as prerequisites are satisfied', async () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    await waitFor(() => {
      expect(screen.queryByText('Select a target channel above')).toBeNull();
    });

    fireEvent.change(screen.getByTestId('team-id-input'), {
      target: { value: 'T01ABC' },
    });
    expect(screen.queryByText('Enter your Slack Team ID')).toBeNull();
    expect(screen.getByText('Paste messages from Slack above')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Paste Messages from Slack'), {
      target: { value: 'VALID_MSG' },
    });
    expect(screen.queryByTestId('import-validation')).toBeNull();
    expect((screen.getByTestId('import-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('persists Team ID to localStorage on successful import', async () => {
    mockChannels = [channelA];
    render(<ImportForm />);

    fireEvent.change(screen.getByTestId('team-id-input'), {
      target: { value: 'T01NEW' },
    });
    fireEvent.change(screen.getByLabelText('Paste Messages from Slack'), {
      target: { value: 'VALID_MSG' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-submit'));
    });

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });
    expect(localStorage.getItem('stm-last-team-id')).toBe('T01NEW');
    expect(screen.getByTestId('import-results')).toBeDefined();
  });
});
