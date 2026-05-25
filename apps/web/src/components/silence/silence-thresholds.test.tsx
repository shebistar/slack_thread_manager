import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SilenceThresholdsTabContent } from './silence-thresholds.js';

const mutateUpdateGlobal = vi.fn().mockResolvedValue({});
const mutateUpsertWorkstream = vi.fn().mockResolvedValue({});
const mutateRemoveWorkstream = vi.fn().mockResolvedValue({});

const mockThresholdData = {
  global: {
    id: 'd8f99f9e-300a-4bc5-8e7e-8429490175a4',
    workstreamId: null,
    workstreamName: null,
    thresholdDays: 3,
    updatedAt: '2026-05-15T07:00:00.000Z',
  },
  overrides: [
    {
      id: '8d5278c2-e0ef-475e-9ce1-ad1881763325',
      workstreamId: '26820f56-78a8-47d8-b151-7d95df4f96dd',
      workstreamName: 'Infrastructure',
      thresholdDays: 5,
      updatedAt: '2026-05-15T07:00:00.000Z',
    },
  ],
};

vi.mock('@/hooks/use-silence-thresholds.js', () => ({
  useSilenceThresholds: vi.fn(() => ({
    data: mockThresholdData,
    isLoading: false,
    error: null,
  })),
  useUpdateGlobalThreshold: vi.fn(() => ({
    mutateAsync: mutateUpdateGlobal,
  })),
  useUpsertWorkstreamThreshold: vi.fn(() => ({
    mutateAsync: mutateUpsertWorkstream,
  })),
  useRemoveWorkstreamThreshold: vi.fn(() => ({
    mutateAsync: mutateRemoveWorkstream,
  })),
}));

vi.mock('@/hooks/use-roster.js', () => ({
  useWorkstreams: vi.fn(() => ({
    data: [
      {
        id: '26820f56-78a8-47d8-b151-7d95df4f96dd',
        name: 'Infrastructure',
      },
      {
        id: 'ea7d2178-df6c-4c41-af4f-9a8ed0be66c2',
        name: 'VM Migration',
      },
    ],
  })),
}));

describe('SilenceThresholdsTabContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders global and override rows', () => {
    render(<SilenceThresholdsTabContent />);
    expect(screen.getByText('Global Default')).toBeInTheDocument();
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
  });

  it('global row cannot be reset', () => {
    render(<SilenceThresholdsTabContent />);
    expect(
      screen.getByRole('button', { name: 'Global default cannot be reset' }),
    ).toBeDisabled();
  });

  it('editing global threshold calls update mutation', async () => {
    render(<SilenceThresholdsTabContent />);
    fireEvent.change(screen.getByLabelText('Threshold for Global Default'), {
      target: { value: '2' },
    });

    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    fireEvent.click(saveButtons[0]!);

    await waitFor(() => {
      expect(mutateUpdateGlobal).toHaveBeenCalledWith({ thresholdDays: 2 });
    });
  });

  it('reset to default calls remove mutation', async () => {
    render(<SilenceThresholdsTabContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));

    await waitFor(() => {
      expect(mutateRemoveWorkstream).toHaveBeenCalledWith(
        '26820f56-78a8-47d8-b151-7d95df4f96dd',
      );
    });
  });

  it('rejects values outside 1..30', async () => {
    render(<SilenceThresholdsTabContent />);
    fireEvent.change(screen.getByLabelText('Threshold for Global Default'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    await waitFor(() => {
      expect(
        screen.getByText('Threshold must be an integer between 1 and 30'),
      ).toBeInTheDocument();
    });
    expect(mutateUpdateGlobal).not.toHaveBeenCalled();
  });
});
