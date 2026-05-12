import { describe, expect, it, vi, beforeEach } from 'vitest';
import { briefingKeys, useBriefingById, useBriefingHistory, useTodayBriefing } from './use-briefings.js';

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: (...args: unknown[]) => mockUseQueryClient(...args),
}));

vi.mock('@/lib/api-client.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('use-briefings hooks', () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseQueryClient.mockReset();
    mockUseQuery.mockReturnValue({ data: null });
  });

  it('briefingKeys factory returns expected key structures', () => {
    expect(briefingKeys.today()).toEqual(['briefings', 'today']);
    expect(briefingKeys.detail('abc')).toEqual(['briefings', 'detail', 'abc']);
    expect(briefingKeys.history()).toEqual(['briefings', 'history', { days: 7 }]);
    expect(briefingKeys.history(14)).toEqual(['briefings', 'history', { days: 14 }]);
  });

  it('useTodayBriefing uses briefingKeys.today query key', () => {
    useTodayBriefing();
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['briefings', 'today'],
      }),
    );
  });

  it('useBriefingById only enables query when id is defined', () => {
    useBriefingById(undefined);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['briefings', 'detail', ''],
        enabled: false,
      }),
    );

    useBriefingById('b-1');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['briefings', 'detail', 'b-1'],
        enabled: true,
      }),
    );
  });

  it('useBriefingHistory defaults to 7 days', () => {
    useBriefingHistory();
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['briefings', 'history', { days: 7 }],
      }),
    );
  });
});
