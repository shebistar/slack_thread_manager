import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SilenceMonitor } from './silence-monitor.js';

const mockDismissMutate = vi.fn();

const mockAlerts = {
  alerts: [
    {
      id: 'alert-1',
      threadId: 'thread-1',
      workstreamId: 'ws-1',
      workstreamName: 'Infrastructure',
      topicName: 'Firewall migration',
      lastActivityAt: '2026-05-10T10:00:00.000Z',
      silenceDays: 5,
      participantCount: 3,
      status: 'active' as const,
      detectedAt: '2026-05-15T07:30:00.000Z',
      sourceThreadUrl: 'https://app.slack.com/client/T123/C456/thread/C456-1234567890',
    },
    {
      id: 'alert-2',
      threadId: 'thread-2',
      workstreamId: 'ws-2',
      workstreamName: 'VM Migration',
      topicName: 'Network policy review',
      lastActivityAt: '2026-05-12T14:00:00.000Z',
      silenceDays: 2,
      participantCount: 5,
      status: 'active' as const,
      detectedAt: '2026-05-15T07:30:00.000Z',
      sourceThreadUrl: 'https://app.slack.com/client/T123/C789/thread/C789-9876543210',
    },
  ],
};

vi.mock('@/hooks/use-silence.js', () => ({
  useSilenceAlerts: vi.fn(() => ({
    data: mockAlerts,
    isLoading: false,
  })),
  useDismissSilenceAlert: vi.fn(() => ({
    mutate: mockDismissMutate,
    isPending: false,
  })),
}));

describe('SilenceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders alert items with correct data', () => {
    render(<SilenceMonitor />);

    expect(screen.getByText('Silence Monitor')).toBeDefined();
    expect(screen.getByText('Firewall migration')).toBeDefined();
    expect(screen.getByText('Network policy review')).toBeDefined();
  });

  it('renders topic name in bold', () => {
    render(<SilenceMonitor />);

    const heading = screen.getByText('Firewall migration');
    expect(heading.tagName).toBe('H4');
    expect(heading.className).toContain('font-medium');
  });

  it('shows days silent and participant count', () => {
    render(<SilenceMonitor />);

    expect(screen.getByText(/Quiet for 5 days/)).toBeDefined();
    expect(screen.getByText(/3 participants/)).toBeDefined();
    expect(screen.getByText(/Quiet for 2 days/)).toBeDefined();
    expect(screen.getByText(/5 participants/)).toBeDefined();
  });

  it('shows workstream labels', () => {
    render(<SilenceMonitor />);

    expect(screen.getByText('Infrastructure')).toBeDefined();
    expect(screen.getByText('VM Migration')).toBeDefined();
  });

  it('renders items with yellow-30 left border accent', () => {
    render(<SilenceMonitor />);

    const items = document.querySelectorAll('.border-l-\\[--color-yellow-30\\]');
    expect(items.length).toBe(2);
  });

  it('renders "View in Slack" links that open in new tab', () => {
    render(<SilenceMonitor />);

    const links = screen.getAllByLabelText('View thread in Slack (opens in new tab)');
    expect(links.length).toBe(2);
    expect(links[0]!.getAttribute('target')).toBe('_blank');
    expect(links[0]!.getAttribute('href')).toBe(
      'https://app.slack.com/client/T123/C456/thread/C456-1234567890',
    );
  });

  it('calls dismiss mutation when dismiss button is clicked', () => {
    render(<SilenceMonitor />);

    const dismissButtons = screen.getAllByText('Dismiss');
    fireEvent.click(dismissButtons[0]!);

    expect(mockDismissMutate).toHaveBeenCalledWith('alert-1');
  });

  it('renders empty state when no alerts exist', async () => {
    const { useSilenceAlerts } = await import('@/hooks/use-silence.js');
    (useSilenceAlerts as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: { alerts: [] },
      isLoading: false,
    });

    render(<SilenceMonitor />);

    expect(screen.getByText('All topics active — no silence detected')).toBeDefined();
  });

  it('renders empty state with check icon', async () => {
    const { useSilenceAlerts } = await import('@/hooks/use-silence.js');
    (useSilenceAlerts as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: { alerts: [] },
      isLoading: false,
    });

    render(<SilenceMonitor />);

    const icon = document.querySelector('svg.text-\\[--color-green-50\\]');
    expect(icon).not.toBeNull();
  });

  it('renders loading skeletons when data is loading', async () => {
    const { useSilenceAlerts } = await import('@/hooks/use-silence.js');
    (useSilenceAlerts as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
    });

    render(<SilenceMonitor />);

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
