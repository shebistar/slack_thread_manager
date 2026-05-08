import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller.js';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { LlmService } from '../pipeline/llm/llm.service.js';
import { CpuModelProvider } from '../pipeline/llm/providers/cpu-model.provider.js';
import { GeminiProvider } from '../pipeline/llm/providers/gemini.provider.js';

describe('AdminController', () => {
  let controller: AdminController;
  const mockCpuProvider = { healthCheck: async () => true };
  const mockGeminiProvider = { healthCheck: async () => true };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LlmService, useValue: {} },
        { provide: CpuModelProvider, useValue: mockCpuProvider },
        { provide: GeminiProvider, useValue: mockGeminiProvider },
      ],
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

  it('returns LLM health status', async () => {
    const result = await controller.getLlmHealth();
    expect(result.data.cpu.healthy).toBe(true);
    expect(result.data.gemini.healthy).toBe(true);
    expect(result.data.status).toBe('ok');
  });
});
