import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { updateGlobalThresholdSchema } from '@slack-thread-manager/shared';
import { SilenceService } from './silence.service.js';
import { SilenceThresholdController } from './silence-threshold.controller.js';

const globalThreshold = {
  id: 'de6f3795-5aa5-4f7d-a203-2bc3779f2852',
  workstreamId: null,
  workstreamName: null,
  thresholdDays: 3,
  updatedAt: '2026-05-15T07:17:00.000Z',
};

const overrideThreshold = {
  id: '6ebf8812-8f9a-45b8-ac5b-2cf1f9149c4f',
  workstreamId: '77bbf355-091e-4cb8-bd4c-1741cb4ad575',
  workstreamName: 'Infrastructure',
  thresholdDays: 5,
  updatedAt: '2026-05-15T07:17:00.000Z',
};

describe('SilenceThresholdController', () => {
  let controller: SilenceThresholdController;
  let silenceService: SilenceService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SilenceThresholdController],
      providers: [
        {
          provide: SilenceService,
          useValue: {
            getThresholdConfiguration: vi.fn().mockResolvedValue({
              global: globalThreshold,
              overrides: [overrideThreshold],
            }),
            updateGlobalThreshold: vi.fn().mockResolvedValue({
              ...globalThreshold,
              thresholdDays: 2,
            }),
            upsertWorkstreamThreshold: vi.fn().mockResolvedValue(overrideThreshold),
            removeWorkstreamThreshold: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(SilenceThresholdController);
    silenceService = module.get(SilenceService);
  });

  it('has @Roles("ADMIN") on the controller class', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SilenceThresholdController);
    expect(roles).toEqual(['ADMIN']);
  });

  it('forbids non-admin users via RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => controller.list,
      getClass: () => SilenceThresholdController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'CONSULTANT' } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('returns global and workstream overrides on list', async () => {
    const result = await controller.list();
    expect(result).toEqual({
      data: {
        global: globalThreshold,
        overrides: [overrideThreshold],
      },
    });
    expect(silenceService.getThresholdConfiguration).toHaveBeenCalledOnce();
  });

  it('updates the global threshold', async () => {
    const result = await controller.updateGlobal({ thresholdDays: 2 });
    expect(result).toEqual({
      data: {
        ...globalThreshold,
        thresholdDays: 2,
      },
    });
    expect(silenceService.updateGlobalThreshold).toHaveBeenCalledWith(2);
  });

  it('upserts a workstream override threshold', async () => {
    const dto = {
      workstreamId: overrideThreshold.workstreamId,
      thresholdDays: 5,
    };
    const result = await controller.upsertWorkstream(dto);
    expect(result).toEqual({ data: overrideThreshold });
    expect(silenceService.upsertWorkstreamThreshold).toHaveBeenCalledWith(
      dto.workstreamId,
      dto.thresholdDays,
    );
  });

  it('propagates NotFoundException for invalid workstream', async () => {
    vi.mocked(silenceService.upsertWorkstreamThreshold).mockRejectedValueOnce(
      new NotFoundException('Workstream missing'),
    );

    await expect(
      controller.upsertWorkstream({
        workstreamId: '77bbf355-091e-4cb8-bd4c-1741cb4ad575',
        thresholdDays: 5,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes a workstream override threshold', async () => {
    await controller.removeWorkstream(overrideThreshold.workstreamId);
    expect(silenceService.removeWorkstreamThreshold).toHaveBeenCalledWith(
      overrideThreshold.workstreamId,
    );
  });

  it('validates threshold range boundaries (1..30)', () => {
    expect(
      updateGlobalThresholdSchema.safeParse({ thresholdDays: 1 }).success,
    ).toBe(true);
    expect(
      updateGlobalThresholdSchema.safeParse({ thresholdDays: 30 }).success,
    ).toBe(true);
    expect(
      updateGlobalThresholdSchema.safeParse({ thresholdDays: 0 }).success,
    ).toBe(false);
    expect(
      updateGlobalThresholdSchema.safeParse({ thresholdDays: 31 }).success,
    ).toBe(false);
  });
});
