import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { BriefingsController } from './briefings.controller.js';
import { BriefingsService } from './briefings.service.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

const mockUser: AuthenticatedUser = {
  sub: 'user-123',
  email: 'shebi@example.com',
  name: 'Shebi',
  role: 'SALES',
};

const mockBriefingResult = {
  briefing: {
    id: 'briefing-1',
    userId: 'user-123',
    briefingDate: new Date('2026-05-11'),
    briefingShape: 'executive_scan' as const,
    generatedAt: new Date(),
    threadCount: 5,
    workstreamCount: 3,
  },
  items: [
    {
      id: 'item-1',
      briefingId: 'briefing-1',
      threadId: 'thread-1',
      headline: 'Platform migration decision',
      summaryText: 'Team decided to migrate to Kubernetes',
      workstreamName: 'Platform',
      sourceThreadUrl: 'https://app.slack.com/client/T123/C456/thread/C456-123',
      itemType: 'standard' as const,
      sortOrder: 0,
    },
  ],
};

describe('BriefingsController', () => {
  let controller: BriefingsController;
  let briefingsService: { getTodayBriefing: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    briefingsService = {
      getTodayBriefing: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [BriefingsController],
      providers: [
        { provide: BriefingsService, useValue: briefingsService },
      ],
    }).compile();

    controller = module.get<BriefingsController>(BriefingsController);
  });

  describe('GET /briefings/today', () => {
    it('returns briefing with items wrapped in data envelope', async () => {
      briefingsService.getTodayBriefing.mockResolvedValue(mockBriefingResult);

      const result = await controller.getTodayBriefing(mockUser);

      expect(result).toEqual({ data: mockBriefingResult });
      expect(briefingsService.getTodayBriefing).toHaveBeenCalledWith('user-123');
    });

    it('returns { data: null } when no briefing exists', async () => {
      briefingsService.getTodayBriefing.mockResolvedValue(null);

      const result = await controller.getTodayBriefing(mockUser);

      expect(result).toEqual({ data: null });
      expect(briefingsService.getTodayBriefing).toHaveBeenCalledWith('user-123');
    });

    it('passes the correct user sub to the service', async () => {
      const adminUser: AuthenticatedUser = {
        sub: 'admin-456',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
      };

      briefingsService.getTodayBriefing.mockResolvedValue(mockBriefingResult);

      await controller.getTodayBriefing(adminUser);

      expect(briefingsService.getTodayBriefing).toHaveBeenCalledWith('admin-456');
    });
  });
});
