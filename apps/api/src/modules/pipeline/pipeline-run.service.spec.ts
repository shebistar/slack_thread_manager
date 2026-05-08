import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PipelineRunService } from './pipeline-run.service.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';

const makeRun = (overrides?: Record<string, unknown>) => ({
  id: 'run-1',
  startedAt: new Date('2026-05-08T10:00:00Z'),
  completedAt: null,
  threadsProcessed: 0,
  threadsFailed: 0,
  fallbackCount: 0,
  ...overrides,
});

describe('PipelineRunService', () => {
  let service: PipelineRunService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([makeRun()]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([makeRun()]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineRunService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<PipelineRunService>(PipelineRunService);
  });

  describe('startRun', () => {
    it('creates a pipeline run with startedAt', async () => {
      const run = await service.startRun();
      expect(run.id).toBe('run-1');
      expect(run.startedAt).toBeInstanceOf(Date);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('completeRun', () => {
    it('sets completedAt and stats', async () => {
      const completedRun = makeRun({
        completedAt: new Date('2026-05-08T10:05:00Z'),
        threadsProcessed: 10,
        threadsFailed: 2,
        fallbackCount: 3,
      });
      mockDb.returning = vi.fn().mockResolvedValue([completedRun]);

      const result = await service.completeRun('run-1', {
        threadsProcessed: 10,
        threadsFailed: 2,
        fallbackCount: 3,
      });

      expect(result.threadsProcessed).toBe(10);
      expect(result.threadsFailed).toBe(2);
      expect(result.fallbackCount).toBe(3);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          threadsProcessed: 10,
          threadsFailed: 2,
          fallbackCount: 3,
        }),
      );
    });

    it('throws when run not found', async () => {
      mockDb.returning = vi.fn().mockResolvedValue([]);
      await expect(
        service.completeRun('nonexistent', {
          threadsProcessed: 0,
          threadsFailed: 0,
          fallbackCount: 0,
        }),
      ).rejects.toThrow('Pipeline run nonexistent not found');
    });
  });

  describe('getLatestRuns', () => {
    it('returns runs ordered by startedAt desc', async () => {
      const runs = [makeRun(), makeRun({ id: 'run-2' })];
      mockDb.limit = vi.fn().mockResolvedValue(runs);

      const result = await service.getLatestRuns(5);
      expect(result).toHaveLength(2);
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(5);
    });
  });
});
