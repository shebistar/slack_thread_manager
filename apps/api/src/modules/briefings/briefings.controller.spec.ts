import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BriefingsController } from './briefings.controller.js';
import { BriefingsService } from './briefings.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
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
  readItemIds: [] as string[],
};

describe('BriefingsController', () => {
  let controller: BriefingsController;
  let briefingsService: {
    getTodayBriefing: ReturnType<typeof vi.fn>;
    resolveUserIdFromAuth: ReturnType<typeof vi.fn>;
    markItemAsRead: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    briefingsService = {
      getTodayBriefing: vi.fn(),
      resolveUserIdFromAuth: vi.fn(),
      markItemAsRead: vi.fn(),
    };
    configService = {
      get: vi.fn().mockReturnValue('0 4 * * *'),
    };

    const module = await Test.createTestingModule({
      controllers: [BriefingsController],
      providers: [
        { provide: BriefingsService, useValue: briefingsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<BriefingsController>(BriefingsController);
  });

  it('uses JwtAuthGuard on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BriefingsController) as unknown[];
    expect(guards).toBeDefined();
    expect(guards?.[0]).toBe(JwtAuthGuard);
  });

  describe('GET /briefings/today', () => {
    it('returns briefing with items wrapped in data envelope', async () => {
      briefingsService.getTodayBriefing.mockResolvedValue(mockBriefingResult);

      const result = await controller.getTodayBriefing(mockUser);

      expect(result).toEqual({
        data: {
          ...mockBriefingResult,
          nextBatchScheduledAt: expect.any(String),
        },
      });
      expect(briefingsService.getTodayBriefing).toHaveBeenCalledWith('user-123', 'shebi@example.com');
    });

    it('returns { data: null } when no briefing exists', async () => {
      briefingsService.getTodayBriefing.mockResolvedValue(null);

      const result = await controller.getTodayBriefing(mockUser);

      expect(result).toEqual({ data: null });
      expect(briefingsService.getTodayBriefing).toHaveBeenCalledWith('user-123', 'shebi@example.com');
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

      expect(briefingsService.getTodayBriefing).toHaveBeenCalledWith('admin-456', 'admin@example.com');
    });
  });

  describe('POST /briefings/items/:itemId/read', () => {
    it('returns data envelope with item id and readAt', async () => {
      const readAt = new Date('2026-05-12T07:00:00.000Z');
      briefingsService.resolveUserIdFromAuth.mockResolvedValue('user-123');
      briefingsService.markItemAsRead.mockResolvedValue({
        briefingItemId: '7f4de3cf-838c-4ff1-8348-5ad4dd8878f0',
        readAt,
      });

      const result = await controller.markItemRead(
        mockUser,
        '7f4de3cf-838c-4ff1-8348-5ad4dd8878f0',
      );

      expect(briefingsService.resolveUserIdFromAuth).toHaveBeenCalledWith('user-123', 'shebi@example.com');
      expect(briefingsService.markItemAsRead).toHaveBeenCalledWith(
        'user-123',
        '7f4de3cf-838c-4ff1-8348-5ad4dd8878f0',
      );
      expect(result).toEqual({
        data: {
          briefingItemId: '7f4de3cf-838c-4ff1-8348-5ad4dd8878f0',
          readAt: '2026-05-12T07:00:00.000Z',
        },
      });
    });

    it('throws NotFoundException when auth user cannot be resolved', async () => {
      briefingsService.resolveUserIdFromAuth.mockResolvedValue(null);

      await expect(
        controller.markItemRead(mockUser, '7f4de3cf-838c-4ff1-8348-5ad4dd8878f0'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(briefingsService.markItemAsRead).not.toHaveBeenCalled();
    });
  });
});
