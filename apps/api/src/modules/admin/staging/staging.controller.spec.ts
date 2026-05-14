import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { StagingController } from './staging.controller.js';
import { StagingService } from './staging.service.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';

const mockStagingId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockBatchId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockReviewerId = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockListResult = {
  items: [
    {
      id: mockStagingId,
      threadId: 'thread-1',
      batchId: mockBatchId,
      status: 'pending',
      createdAt: '2026-05-01T10:00:00.000Z',
      reviewedAt: null,
      reviewedBy: null,
      workstream: { id: 'ws-1', name: 'Platform' },
      flags: [],
      originalContent: { technicalSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] }, plainSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] } },
      anonymizedContent: { technicalSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] }, plainSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] } },
    },
  ],
  counts: { total: 5, pending: 3, approved: 1, rejected: 1, flagged: 2 },
  batchSummary: [],
};

const mockReviewResult = { batchComplete: false, remainingPending: 2 };
const mockApproveAllResult = { approvedCount: 3, remainingPending: 1, batchComplete: false };
const mockBatchProgress = {
  batchId: mockBatchId,
  total: 5,
  pending: 2,
  approved: 2,
  rejected: 1,
  createdAt: '2026-05-01T10:00:00.000Z',
};

describe('StagingController', () => {
  let controller: StagingController;
  let stagingService: StagingService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StagingController],
      providers: [
        {
          provide: StagingService,
          useValue: {
            listPending: vi.fn().mockResolvedValue(mockListResult),
            reviewItem: vi.fn().mockResolvedValue(mockReviewResult),
            approveAllClean: vi.fn().mockResolvedValue(mockApproveAllResult),
            getBatchProgress: vi.fn().mockResolvedValue(mockBatchProgress),
          },
        },
      ],
    }).compile();

    controller = module.get<StagingController>(StagingController);
    stagingService = module.get<StagingService>(StagingService);
  });

  it('has @Roles("ADMIN") on the controller class', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, StagingController);
    expect(roles).toEqual(['ADMIN']);
  });

  describe('list', () => {
    it('returns { data: stagingQueueList }', async () => {
      const result = await controller.list({ view: 'all' });
      expect(result).toEqual({ data: mockListResult });
      expect(stagingService.listPending).toHaveBeenCalledWith({ view: 'all' });
    });

    it('passes filter params to service', async () => {
      await controller.list({ view: 'flagged', batchId: mockBatchId });
      expect(stagingService.listPending).toHaveBeenCalledWith({
        view: 'flagged',
        batchId: mockBatchId,
      });
    });
  });

  describe('reviewItem', () => {
    it('calls service with correct params and returns { data: result }', async () => {
      const req = { user: { sub: mockReviewerId, email: 'a@b.c', name: 'Admin', role: 'ADMIN' as const } };
      const result = await controller.reviewItem(mockStagingId, { action: 'approve' }, req);
      expect(result).toEqual({ data: mockReviewResult });
      expect(stagingService.reviewItem).toHaveBeenCalledWith(
        mockStagingId,
        'approve',
        mockReviewerId,
      );
    });

    it('passes reject action correctly', async () => {
      const req = { user: { sub: mockReviewerId, email: 'a@b.c', name: 'Admin', role: 'ADMIN' as const } };
      await controller.reviewItem(mockStagingId, { action: 'reject' }, req);
      expect(stagingService.reviewItem).toHaveBeenCalledWith(
        mockStagingId,
        'reject',
        mockReviewerId,
      );
    });
  });

  describe('approveAllClean', () => {
    it('calls service and returns { data: result }', async () => {
      const req = { user: { sub: mockReviewerId, email: 'a@b.c', name: 'Admin', role: 'ADMIN' as const } };
      const result = await controller.approveAllClean({}, req);
      expect(result).toEqual({ data: mockApproveAllResult });
      expect(stagingService.approveAllClean).toHaveBeenCalledWith({}, mockReviewerId);
    });
  });

  describe('getBatchProgress', () => {
    it('returns { data: batchSummary }', async () => {
      const result = await controller.getBatchProgress(mockBatchId);
      expect(result).toEqual({ data: mockBatchProgress });
      expect(stagingService.getBatchProgress).toHaveBeenCalledWith(mockBatchId);
    });
  });
});
