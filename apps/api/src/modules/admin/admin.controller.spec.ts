import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller.js';
import { ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { LlmService } from '../pipeline/llm/llm.service.js';
import { CpuModelProvider } from '../pipeline/llm/providers/cpu-model.provider.js';
import { GeminiProvider } from '../pipeline/llm/providers/gemini.provider.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

describe('AdminController', () => {
  let controller: AdminController;
  const mockCpuProvider = { healthCheck: async () => true };
  const mockGeminiProvider = { healthCheck: async () => true };
  const mockPipelineService = {
    runClassification: vi.fn().mockResolvedValue({ processed: 0, failed: 0, pendingRetry: 0 }),
    runSummarization: vi.fn().mockResolvedValue({ processed: 0, failed: 0, pendingRetry: 0 }),
    runEmbedding: vi.fn().mockResolvedValue({ processed: 0, failed: 0, pendingRetry: 0 }),
    runCorrelation: vi.fn().mockResolvedValue({ created: 0, updated: 0, pairsEvaluated: 0 }),
    runBlocklistFilter: vi.fn().mockResolvedValue({ threadsScanned: 0, threadsWithMatches: 0, totalMatches: 0, results: [] }),
    runLlmEntityDetection: vi.fn().mockResolvedValue({ threadsProcessed: 0, entitiesDetected: 0, results: [] }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LlmService, useValue: {} },
        { provide: CpuModelProvider, useValue: mockCpuProvider },
        { provide: GeminiProvider, useValue: mockGeminiProvider },
        { provide: PipelineService, useValue: mockPipelineService },
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

  it('runs full pipeline and returns correlation result', async () => {
    mockPipelineService.runCorrelation.mockResolvedValue({ created: 4, updated: 0, pairsEvaluated: 2 });

    const result = await controller.runPipeline();

    expect(result.data).toHaveProperty('correlation');
    expect(result.data.correlation).toEqual({ created: 4, updated: 0, pairsEvaluated: 2 });
    expect(mockPipelineService.runCorrelation).toHaveBeenCalledOnce();
  });

  it('runs full pipeline and returns blocklistFilter result', async () => {
    vi.clearAllMocks();
    mockPipelineService.runBlocklistFilter.mockResolvedValue({
      threadsScanned: 3,
      threadsWithMatches: 1,
      totalMatches: 2,
      results: [],
    });
    mockPipelineService.runLlmEntityDetection.mockResolvedValue({
      threadsProcessed: 0,
      entitiesDetected: 0,
      results: [],
    });

    const result = await controller.runPipeline();

    expect(result.data).toHaveProperty('blocklistFilter');
    expect(result.data.blocklistFilter).toEqual({
      threadsScanned: 3,
      threadsWithMatches: 1,
      totalMatches: 2,
      results: [],
    });
    expect(mockPipelineService.runBlocklistFilter).toHaveBeenCalledOnce();
  });

  it('8.14: pipeline/run response includes entityDetection field', async () => {
    vi.clearAllMocks();
    mockPipelineService.runBlocklistFilter.mockResolvedValue({
      threadsScanned: 2,
      threadsWithMatches: 1,
      totalMatches: 1,
      results: [{ threadId: 'thread-1' }],
    });
    mockPipelineService.runLlmEntityDetection.mockResolvedValue({
      threadsProcessed: 1,
      entitiesDetected: 2,
      results: [{ threadId: 'thread-1', flags: [{ source: 'LLM', term: 'Entity' }] }],
    });

    const result = await controller.runPipeline();

    expect(result.data).toHaveProperty('entityDetection');
    expect(result.data.entityDetection).toEqual({
      threadsProcessed: 1,
      entitiesDetected: 2,
      results: [{ threadId: 'thread-1', flags: [{ source: 'LLM', term: 'Entity' }] }],
    });
    expect(mockPipelineService.runLlmEntityDetection).toHaveBeenCalledWith(
      [{ threadId: 'thread-1' }],
    );
  });
});
