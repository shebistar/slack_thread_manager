import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BackfillController } from './backfill.controller.js';
import { BackfillService } from './backfill.service.js';

describe('BackfillController', () => {
  let controller: BackfillController;
  let mockBackfillService: {
    startBackfill: ReturnType<typeof vi.fn>;
    getBackfillStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockBackfillService = {
      startBackfill: vi.fn().mockReturnValue({ jobId: 'test-job-uuid-1234' }),
      getBackfillStatus: vi.fn().mockReturnValue({
        jobId: 'test-job-uuid-1234',
        status: 'running',
        channelsTotal: 2,
        channelsProcessed: 1,
        threadsStored: 5,
        errors: 0,
        startedAt: new Date('2026-05-08T09:00:00Z'),
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [BackfillController],
      providers: [
        { provide: BackfillService, useValue: mockBackfillService },
      ],
    }).compile();

    controller = module.get(BackfillController);
  });

  describe('startBackfill', () => {
    it('should return 202 Accepted with jobId and pending status', () => {
      const result = controller.startBackfill({ oldestTs: '1700000000.000000' });

      expect(mockBackfillService.startBackfill).toHaveBeenCalledWith({
        oldestTs: '1700000000.000000',
      });
      expect(result).toEqual({ data: { jobId: 'test-job-uuid-1234', status: 'pending' } });
    });
  });

  describe('getBackfillStatus', () => {
    it('should return job status when found', () => {
      const result = controller.getBackfillStatus('test-job-uuid-1234');

      expect(mockBackfillService.getBackfillStatus).toHaveBeenCalledWith('test-job-uuid-1234');
      expect(result.data.jobId).toBe('test-job-uuid-1234');
      expect(result.data.status).toBe('running');
      expect(result.data.channelsProcessed).toBe(1);
    });

    it('should throw NotFoundException when jobId is unknown', () => {
      mockBackfillService.getBackfillStatus.mockReturnValue(undefined);

      expect(() => controller.getBackfillStatus('unknown-id')).toThrow(NotFoundException);
    });
  });
});
