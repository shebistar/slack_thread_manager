import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

const mockChannelId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const mockWorkstreamId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';

const mockChannelRow = {
  id: mockChannelId,
  slackChannelId: 'C01ABC123',
  name: 'vm-migration-general',
  workstreamId: mockWorkstreamId,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  workstream: { id: mockWorkstreamId, name: 'Platform' },
};

function buildMockDb() {
  const dbMock = {
    query: {
      slackChannels: {
        findMany: vi.fn().mockResolvedValue([mockChannelRow]),
        findFirst: vi.fn().mockResolvedValue(mockChannelRow),
      },
    },
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockChannelRow]),
    orderBy: vi.fn().mockResolvedValue([]),
  };

  return dbMock;
}

describe('ChannelsService', () => {
  let service: ChannelsService;
  let dbMock: ReturnType<typeof buildMockDb>;

  beforeEach(async () => {
    dbMock = buildMockDb();

    const module = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: DATABASE_TOKEN, useValue: dbMock },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  describe('findAll', () => {
    it('returns all channels with workstream name', async () => {
      const result = await service.findAll();
      expect(dbMock.query.slackChannels.findMany).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
      expect(result[0].slackChannelId).toBe('C01ABC123');
      expect(result[0].workstreamName).toBe('Platform');
    });

    it('serializes createdAt as ISO string', async () => {
      const result = await service.findAll();
      expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('create', () => {
    it('inserts a channel and returns it with workstream', async () => {
      dbMock.where.mockResolvedValueOnce([{ id: mockWorkstreamId }]);

      const result = await service.create({
        slackChannelId: 'C01ABC123',
        name: 'vm-migration-general',
        workstreamId: mockWorkstreamId,
        isActive: true,
      });

      expect(dbMock.insert).toHaveBeenCalled();
      expect(result.slackChannelId).toBe('C01ABC123');
    });

    it('throws ConflictException on duplicate slack channel ID', async () => {
      dbMock.where.mockResolvedValueOnce([{ id: mockWorkstreamId }]);
      dbMock.returning.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.create({
          slackChannelId: 'C01ABC123',
          name: 'duplicate',
          workstreamId: mockWorkstreamId,
          isActive: true,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException on invalid workstream ID', async () => {
      dbMock.where.mockResolvedValueOnce([]);

      await expect(
        service.create({
          slackChannelId: 'C01ABC123',
          name: 'test',
          workstreamId: 'b47ac10b-58cc-4372-a567-0e02b2c3d479',
          isActive: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('updates channel fields and returns updated channel', async () => {
      dbMock.where.mockResolvedValueOnce([{ id: mockWorkstreamId }]);
      dbMock.returning.mockResolvedValueOnce([mockChannelRow]);

      const result = await service.update(mockChannelId, {
        name: 'updated-name',
        workstreamId: mockWorkstreamId,
      });

      expect(dbMock.update).toHaveBeenCalled();
      expect(result.slackChannelId).toBe('C01ABC123');
    });

    it('throws NotFoundException when channel does not exist', async () => {
      dbMock.returning.mockResolvedValueOnce([]);

      await expect(
        service.update('b47ac10b-58cc-4372-a567-0e02b2c3d479', { name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleActive', () => {
    it('flips isActive and returns updated channel', async () => {
      const result = await service.toggleActive(mockChannelId);
      expect(dbMock.update).toHaveBeenCalled();
      expect(result.id).toBe(mockChannelId);
    });

    it('throws NotFoundException when channel does not exist', async () => {
      dbMock.query.slackChannels.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.toggleActive('b47ac10b-58cc-4372-a567-0e02b2c3d479'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes channel by id', async () => {
      dbMock.returning.mockResolvedValueOnce([mockChannelRow]);

      await service.remove(mockChannelId);
      expect(dbMock.delete).toHaveBeenCalled();
    });

    it('throws NotFoundException when channel does not exist', async () => {
      dbMock.returning.mockResolvedValueOnce([]);

      await expect(
        service.remove('b47ac10b-58cc-4372-a567-0e02b2c3d479'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
