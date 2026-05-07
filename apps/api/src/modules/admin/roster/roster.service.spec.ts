import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RosterService } from './roster.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

const mockUserId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const mockWorkstreamId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';

const mockUserRow = {
  id: mockUserId,
  email: 'alice@example.com',
  displayName: 'Alice',
  slackHandle: 'alice',
  slackNicknames: [],
  role: 'ARCHITECT' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  userWorkstreams: [
    {
      workstream: { id: mockWorkstreamId, name: 'Platform' },
    },
  ],
};

const mockWorkstreamRow = {
  id: mockWorkstreamId,
  name: 'Platform',
  description: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function buildMockDb() {
  const txMock = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockUserRow]),
  };

  const dbMock = {
    query: {
      users: {
        findMany: vi.fn().mockResolvedValue([mockUserRow]),
        findFirst: vi.fn().mockResolvedValue(mockUserRow),
      },
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([mockWorkstreamRow]),
    where: vi.fn().mockResolvedValue([{ id: mockWorkstreamId }]),
    transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  return { dbMock, txMock };
}

describe('RosterService', () => {
  let service: RosterService;
  let dbMock: ReturnType<typeof buildMockDb>['dbMock'];
  let txMock: ReturnType<typeof buildMockDb>['txMock'];

  beforeEach(async () => {
    ({ dbMock, txMock } = buildMockDb());

    const module = await Test.createTestingModule({
      providers: [
        RosterService,
        { provide: DATABASE_TOKEN, useValue: dbMock },
      ],
    }).compile();

    service = module.get<RosterService>(RosterService);
  });

  describe('findAll', () => {
    it('returns all users with workstreams', async () => {
      const result = await service.findAll();
      expect(dbMock.query.users.findMany).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('alice@example.com');
      expect(result[0].workstreams).toHaveLength(1);
      expect(result[0].workstreams[0].name).toBe('Platform');
    });

    it('serializes dates as ISO strings', async () => {
      const result = await service.findAll();
      expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result[0].updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('findAllWorkstreams', () => {
    it('returns workstream list', async () => {
      const result = await service.findAllWorkstreams();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Platform');
    });
  });

  describe('create', () => {
    it('inserts user and workstream assignments in a transaction', async () => {
      await service.create({
        email: 'bob@example.com',
        displayName: 'Bob',
        slackHandle: 'bob',
        slackNicknames: [],
        role: 'PM',
        workstreamIds: [mockWorkstreamId],
      });

      expect(dbMock.transaction).toHaveBeenCalledOnce();
      expect(txMock.insert).toHaveBeenCalled();
      expect(txMock.values).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates user fields and replaces workstream assignments', async () => {
      txMock.returning.mockResolvedValue([mockUserRow]);

      await service.update(mockUserId, {
        displayName: 'Alice Updated',
        workstreamIds: [mockWorkstreamId],
      });

      expect(dbMock.transaction).toHaveBeenCalledOnce();
    });
  });

  describe('remove', () => {
    it('deletes user_workstreams rows then user row in a transaction', async () => {
      txMock.returning.mockResolvedValue([mockUserRow]);

      await service.remove(mockUserId);

      expect(dbMock.transaction).toHaveBeenCalledOnce();
      expect(txMock.delete).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when user does not exist', async () => {
      txMock.returning.mockResolvedValue([]);

      await expect(service.remove('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });
});
