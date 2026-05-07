import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';

const mockChannelId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const mockWorkstreamId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';

const mockChannel = {
  id: mockChannelId,
  slackChannelId: 'C01ABC123',
  name: 'vm-migration-general',
  workstreamId: mockWorkstreamId,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  workstreamName: 'Platform',
};

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let channelsService: ChannelsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        {
          provide: ChannelsService,
          useValue: {
            findAll: vi.fn().mockResolvedValue([mockChannel]),
            create: vi.fn().mockResolvedValue(mockChannel),
            update: vi.fn().mockResolvedValue(mockChannel),
            toggleActive: vi.fn().mockResolvedValue(mockChannel),
            remove: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
    channelsService = module.get<ChannelsService>(ChannelsService);
  });

  it('has @Roles("ADMIN") on the controller class', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ChannelsController);
    expect(roles).toEqual(['ADMIN']);
  });

  describe('findAll', () => {
    it('returns { data: channels }', async () => {
      const result = await controller.findAll();
      expect(result).toEqual({ data: [mockChannel] });
      expect(channelsService.findAll).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    it('calls channelsService.create and returns { data: channel }', async () => {
      const dto = {
        slackChannelId: 'C01ABC123',
        name: 'vm-migration-general',
        workstreamId: mockWorkstreamId,
        isActive: true,
      };
      const result = await controller.create(dto);
      expect(result).toEqual({ data: mockChannel });
      expect(channelsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('calls channelsService.update and returns { data: channel }', async () => {
      const dto = { name: 'updated-name' };
      const result = await controller.update(mockChannelId, dto);
      expect(result).toEqual({ data: mockChannel });
      expect(channelsService.update).toHaveBeenCalledWith(mockChannelId, dto);
    });
  });

  describe('toggleActive', () => {
    it('calls channelsService.toggleActive and returns { data: channel }', async () => {
      const result = await controller.toggleActive(mockChannelId);
      expect(result).toEqual({ data: mockChannel });
      expect(channelsService.toggleActive).toHaveBeenCalledWith(mockChannelId);
    });
  });

  describe('remove', () => {
    it('calls channelsService.remove and returns void', async () => {
      await controller.remove(mockChannelId);
      expect(channelsService.remove).toHaveBeenCalledWith(mockChannelId);
    });
  });
});
