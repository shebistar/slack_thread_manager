import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { EnrichmentController } from './enrichment.controller.js';
import { EnrichmentService } from './enrichment.service.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { ENRICHMENT_SOURCES } from './enrichment-source.interface.js';

describe('EnrichmentController', () => {
  let controller: EnrichmentController;

  const mockEnrichmentService = {
    getEnrichment: vi.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EnrichmentController],
      providers: [
        { provide: EnrichmentService, useValue: mockEnrichmentService },
      ],
    }).compile();

    controller = module.get<EnrichmentController>(EnrichmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns enrichment data wrapped in { data: ... }', async () => {
    const threadId = '11111111-1111-1111-1111-111111111111';
    const mockResult = {
      sections: [
        {
          title: 'OpenShift Networking',
          description: 'Network configuration guide',
          sourceUrl: 'https://docs.openshift.com/networking',
          sourceType: 'OPENSHIFT_DOCS' as const,
          relevanceScore: 0.85,
        },
      ],
      meta: {
        threadId,
        queriedAt: '2026-05-26T09:00:00.000Z',
        sourcesAvailable: 3,
        sourcesSucceeded: 1,
      },
    };

    mockEnrichmentService.getEnrichment.mockResolvedValue(mockResult);

    const result = await controller.getEnrichment(threadId);

    expect(result).toEqual({ data: mockResult });
    expect(mockEnrichmentService.getEnrichment).toHaveBeenCalledWith(threadId);
  });

  it('returns valid empty sections payload when no sources available', async () => {
    const threadId = '22222222-2222-2222-2222-222222222222';
    const mockResult = {
      sections: [],
      meta: {
        threadId,
        queriedAt: '2026-05-26T09:00:00.000Z',
        sourcesAvailable: 3,
        sourcesSucceeded: 0,
      },
    };

    mockEnrichmentService.getEnrichment.mockResolvedValue(mockResult);

    const result = await controller.getEnrichment(threadId);

    expect(result).toEqual({ data: mockResult });
    expect(result.data.sections).toEqual([]);
  });

  it('has @Roles decorator restricting to ARCHITECT and CONSULTANT', () => {
    const metadata = Reflect.getMetadata('roles', EnrichmentController);
    expect(metadata).toEqual(['ARCHITECT', 'CONSULTANT']);
  });
});
