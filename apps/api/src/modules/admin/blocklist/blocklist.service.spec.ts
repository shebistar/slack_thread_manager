import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BlocklistService } from './blocklist.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

const mockEntryId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockBlocklistRow = {
  id: mockEntryId,
  term: 'Acme Corp',
  replacement: '[COMPANY]',
  category: 'company_name' as const,
  createdAt: new Date('2026-05-01T10:00:00Z'),
};

function buildMockDb() {
  const dbMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([mockBlocklistRow]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockBlocklistRow]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };

  return dbMock;
}

describe('BlocklistService', () => {
  let service: BlocklistService;
  let dbMock: ReturnType<typeof buildMockDb>;

  beforeEach(async () => {
    dbMock = buildMockDb();

    const module = await Test.createTestingModule({
      providers: [
        BlocklistService,
        { provide: DATABASE_TOKEN, useValue: dbMock },
      ],
    }).compile();

    service = module.get<BlocklistService>(BlocklistService);
  });

  describe('list', () => {
    it('should return blocklist entries with total count', async () => {
      const result = await service.list({ sortBy: 'createdAt', sortOrder: 'desc' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: mockEntryId,
        term: 'Acme Corp',
        replacement: '[COMPANY]',
        category: 'company_name',
        createdAt: '2026-05-01T10:00:00.000Z',
      });
      expect(result.total).toBe(1);
      expect(dbMock.select).toHaveBeenCalled();
    });

    it('should pass search filter to query', async () => {
      dbMock.orderBy.mockResolvedValue([]);
      await service.list({ search: 'acme', sortBy: 'term', sortOrder: 'asc' });
      expect(dbMock.where).toHaveBeenCalled();
    });

    it('should pass category filter to query', async () => {
      dbMock.orderBy.mockResolvedValue([]);
      await service.list({ category: 'person_name', sortBy: 'createdAt', sortOrder: 'desc' });
      expect(dbMock.where).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create and return a new blocklist entry', async () => {
      const dto = { term: 'Acme Corp', replacement: '[COMPANY]', category: 'company_name' as const };
      const result = await service.create(dto);

      expect(result).toEqual({
        id: mockEntryId,
        term: 'Acme Corp',
        replacement: '[COMPANY]',
        category: 'company_name',
        createdAt: '2026-05-01T10:00:00.000Z',
      });
      expect(dbMock.insert).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate term', async () => {
      dbMock.returning.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: '23505' }));

      await expect(
        service.create({ term: 'Duplicate', replacement: '[DUP]', category: 'company_name' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update and return the entry', async () => {
      const result = await service.update(mockEntryId, { replacement: '[UPDATED]' });

      expect(result).toEqual({
        id: mockEntryId,
        term: 'Acme Corp',
        replacement: '[COMPANY]',
        category: 'company_name',
        createdAt: '2026-05-01T10:00:00.000Z',
      });
      expect(dbMock.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when entry does not exist', async () => {
      dbMock.returning.mockResolvedValueOnce([]);

      await expect(
        service.update('nonexistent-id', { replacement: '[X]' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on duplicate term during update', async () => {
      dbMock.returning.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: '23505' }));

      await expect(
        service.update(mockEntryId, { term: 'Existing Term' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete the entry', async () => {
      await service.remove(mockEntryId);
      expect(dbMock.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when entry does not exist', async () => {
      dbMock.returning.mockResolvedValueOnce([]);

      await expect(service.remove('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });
});
