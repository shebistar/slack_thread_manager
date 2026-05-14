import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BriefingGenerationJob } from './briefing-generation.job.js';
import { BriefingsService } from './briefings.service.js';

describe('BriefingGenerationJob', () => {
  let job: BriefingGenerationJob;
  let mockBriefingsService: { generateBriefingsForAllUsers: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockBriefingsService = {
      generateBriefingsForAllUsers: vi.fn().mockResolvedValue({
        usersProcessed: 3,
        briefingsGenerated: 3,
        itemsGenerated: 15,
      }),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue('0 4 * * *'),
    };

    const module = await Test.createTestingModule({
      providers: [
        BriefingGenerationJob,
        { provide: BriefingsService, useValue: mockBriefingsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    job = module.get(BriefingGenerationJob);
  });

  describe('handleBriefingGeneration', () => {
    it('should call generateBriefingsForAllUsers', async () => {
      await job.handleBriefingGeneration();

      expect(mockBriefingsService.generateBriefingsForAllUsers).toHaveBeenCalledOnce();
    });

    it('should not throw when service succeeds', async () => {
      await expect(job.handleBriefingGeneration()).resolves.not.toThrow();
    });

    it('should catch and log errors without rethrowing', async () => {
      mockBriefingsService.generateBriefingsForAllUsers.mockRejectedValue(
        new Error('Generation failed'),
      );

      await expect(job.handleBriefingGeneration()).resolves.not.toThrow();
    });
  });
});
