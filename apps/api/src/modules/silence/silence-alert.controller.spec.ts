import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SilenceAlertController } from './silence-alert.controller.js';
import { SilenceService } from './silence.service.js';

describe('SilenceAlertController', () => {
  let controller: SilenceAlertController;
  let mockSilenceService: {
    getActiveAlerts: ReturnType<typeof vi.fn>;
    dismissAlert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockSilenceService = {
      getActiveAlerts: vi.fn(),
      dismissAlert: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [SilenceAlertController],
      providers: [
        { provide: SilenceService, useValue: mockSilenceService },
      ],
    }).compile();

    controller = module.get(SilenceAlertController);
  });

  describe('GET /silence/alerts', () => {
    it('should return active alerts with correct data shape', async () => {
      const alerts = {
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
            status: 'active',
            detectedAt: '2026-05-15T07:30:00.000Z',
            sourceThreadUrl: 'https://app.slack.com/client/T123/C456/thread/C456-1234567890',
          },
        ],
      };
      mockSilenceService.getActiveAlerts.mockResolvedValue(alerts);

      const result = await controller.listActive();

      expect(result).toEqual({ data: alerts });
      expect(mockSilenceService.getActiveAlerts).toHaveBeenCalledOnce();
    });

    it('should return empty array when no active alerts', async () => {
      mockSilenceService.getActiveAlerts.mockResolvedValue({ alerts: [] });

      const result = await controller.listActive();

      expect(result).toEqual({ data: { alerts: [] } });
    });
  });

  describe('PATCH /silence/alerts/:id/dismiss', () => {
    it('should dismiss alert and return confirmation', async () => {
      mockSilenceService.dismissAlert.mockResolvedValue(undefined);

      const result = await controller.dismiss('alert-1');

      expect(result).toEqual({ data: { id: 'alert-1', status: 'dismissed' } });
      expect(mockSilenceService.dismissAlert).toHaveBeenCalledWith('alert-1');
    });

    it('should propagate NotFoundException for non-existent alert', async () => {
      mockSilenceService.dismissAlert.mockRejectedValue(
        new NotFoundException('Active silence alert missing-id not found'),
      );

      await expect(controller.dismiss('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should propagate NotFoundException for already-dismissed alert', async () => {
      mockSilenceService.dismissAlert.mockRejectedValue(
        new NotFoundException('Active silence alert dismissed-id not found'),
      );

      await expect(controller.dismiss('dismissed-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
