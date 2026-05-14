import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { BlocklistController } from './blocklist.controller.js';
import { BlocklistService } from './blocklist.service.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';

const mockEntryId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockEntry = {
  id: mockEntryId,
  term: 'Acme Corp',
  replacement: '[COMPANY]',
  category: 'company_name',
  createdAt: '2026-05-01T10:00:00.000Z',
};

const mockListResult = {
  items: [mockEntry],
  total: 1,
};

describe('BlocklistController', () => {
  let controller: BlocklistController;
  let blocklistService: BlocklistService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BlocklistController],
      providers: [
        {
          provide: BlocklistService,
          useValue: {
            list: vi.fn().mockResolvedValue(mockListResult),
            create: vi.fn().mockResolvedValue(mockEntry),
            update: vi.fn().mockResolvedValue(mockEntry),
            remove: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<BlocklistController>(BlocklistController);
    blocklistService = module.get<BlocklistService>(BlocklistService);
  });

  it('has @Roles("ADMIN") on the controller class', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, BlocklistController);
    expect(roles).toEqual(['ADMIN']);
  });

  describe('list', () => {
    it('returns { data: blocklistListResponse }', async () => {
      const query = { sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
      const result = await controller.list(query);
      expect(result).toEqual({ data: mockListResult });
      expect(blocklistService.list).toHaveBeenCalledWith(query);
    });

    it('passes search and category filters', async () => {
      const query = { search: 'acme', category: 'company_name' as const, sortBy: 'term' as const, sortOrder: 'asc' as const };
      await controller.list(query);
      expect(blocklistService.list).toHaveBeenCalledWith(query);
    });
  });

  describe('create', () => {
    it('returns { data: entry } with CREATED status', async () => {
      const dto = { term: 'Acme Corp', replacement: '[COMPANY]', category: 'company_name' as const };
      const result = await controller.create(dto);
      expect(result).toEqual({ data: mockEntry });
      expect(blocklistService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('returns { data: entry }', async () => {
      const dto = { replacement: '[UPDATED]' };
      const result = await controller.update(mockEntryId, dto);
      expect(result).toEqual({ data: mockEntry });
      expect(blocklistService.update).toHaveBeenCalledWith(mockEntryId, dto);
    });
  });

  describe('remove', () => {
    it('calls service remove', async () => {
      await controller.remove(mockEntryId);
      expect(blocklistService.remove).toHaveBeenCalledWith(mockEntryId);
    });
  });
});
