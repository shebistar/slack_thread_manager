import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { RosterController } from './roster.controller.js';
import { RosterService } from './roster.service.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';

const mockMember = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  email: 'alice@example.com',
  displayName: 'Alice',
  slackHandle: 'alice',
  slackNicknames: [],
  role: 'ARCHITECT' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workstreams: [],
};

const mockWorkstream = {
  id: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
  name: 'Platform',
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('RosterController', () => {
  let controller: RosterController;
  let rosterService: RosterService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RosterController],
      providers: [
        {
          provide: RosterService,
          useValue: {
            findAll: vi.fn().mockResolvedValue([mockMember]),
            findAllWorkstreams: vi.fn().mockResolvedValue([mockWorkstream]),
            create: vi.fn().mockResolvedValue(mockMember),
            update: vi.fn().mockResolvedValue(mockMember),
            remove: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<RosterController>(RosterController);
    rosterService = module.get<RosterService>(RosterService);
  });

  it('has @Roles("ADMIN") on the controller class', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, RosterController);
    expect(roles).toEqual(['ADMIN']);
  });

  describe('findAll', () => {
    it('returns { data: members }', async () => {
      const result = await controller.findAll();
      expect(result).toEqual({ data: [mockMember] });
      expect(rosterService.findAll).toHaveBeenCalledOnce();
    });
  });

  describe('findAllWorkstreams', () => {
    it('returns { data: workstreams }', async () => {
      const result = await controller.findAllWorkstreams();
      expect(result).toEqual({ data: [mockWorkstream] });
    });
  });

  describe('create', () => {
    it('calls rosterService.create and returns { data: member }', async () => {
      const dto = {
        email: 'alice@example.com',
        displayName: 'Alice',
        slackHandle: 'alice',
        slackNicknames: [],
        role: 'ARCHITECT' as const,
        workstreamIds: [],
      };
      const result = await controller.create(dto);
      expect(result).toEqual({ data: mockMember });
      expect(rosterService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('calls rosterService.update and returns { data: member }', async () => {
      const dto = { displayName: 'Alice Updated' };
      const result = await controller.update(mockMember.id, dto);
      expect(result).toEqual({ data: mockMember });
      expect(rosterService.update).toHaveBeenCalledWith(mockMember.id, dto);
    });
  });

  describe('remove', () => {
    it('calls rosterService.remove and returns void', async () => {
      await controller.remove(mockMember.id);
      expect(rosterService.remove).toHaveBeenCalledWith(mockMember.id);
    });
  });
});
