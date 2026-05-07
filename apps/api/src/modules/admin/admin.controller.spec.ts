import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller.js';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('returns admin health status', () => {
    expect(controller.getAdminHealth()).toEqual({
      data: { status: 'admin-ok' },
    });
  });

  it('has @Roles("ADMIN") metadata on getAdminHealth', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminController.prototype.getAdminHealth);
    expect(roles).toEqual(['ADMIN']);
  });
});
