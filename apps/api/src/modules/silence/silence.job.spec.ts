import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SilenceJob } from './silence.job.js';
import { SilenceService } from './silence.service.js';
import type { DetectionSummary } from './silence.service.js';

describe('SilenceJob', () => {
  let job: SilenceJob;
  let mockSilenceService: {
    runDetection: ReturnType<typeof vi.fn>;
  };

  const defaultSummary: DetectionSummary = {
    threadsScanned: 10,
    alertsCreated: 2,
    alertsResolved: 1,
    durationMs: 150,
  };

  beforeEach(async () => {
    mockSilenceService = {
      runDetection: vi.fn().mockResolvedValue(defaultSummary),
    };

    const module = await Test.createTestingModule({
      providers: [
        SilenceJob,
        { provide: SilenceService, useValue: mockSilenceService },
        { provide: SchedulerRegistry, useValue: { getCronJob: vi.fn(), deleteCronJob: vi.fn(), addCronJob: vi.fn() } },
      ],
    }).compile();

    job = module.get(SilenceJob);
  });

  describe('handleSilenceDetectionCron', () => {
    it('should call runDetection and complete successfully', async () => {
      await job.handleSilenceDetectionCron();
      expect(mockSilenceService.runDetection).toHaveBeenCalledOnce();
    });

    it('should not throw when runDetection fails', async () => {
      mockSilenceService.runDetection.mockRejectedValue(new Error('DB unavailable'));

      await expect(job.handleSilenceDetectionCron()).resolves.toBeUndefined();
      expect(mockSilenceService.runDetection).toHaveBeenCalledOnce();
    });
  });

  describe('runDetection (manual entrypoint)', () => {
    it('should delegate to silenceService.runDetection', async () => {
      const result = await job.runDetection();
      expect(result).toEqual(defaultSummary);
      expect(mockSilenceService.runDetection).toHaveBeenCalledOnce();
    });

    it('should propagate errors from service', async () => {
      const error = new Error('Detection failed');
      mockSilenceService.runDetection.mockRejectedValue(error);

      await expect(job.runDetection()).rejects.toThrow('Detection failed');
    });
  });
});
