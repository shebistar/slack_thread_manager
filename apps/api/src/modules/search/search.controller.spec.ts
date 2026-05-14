import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';
import { searchRequestSchema } from '@slack-thread-manager/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BadRequestException } from '@nestjs/common';

const mockUser: AuthenticatedUser = {
  sub: 'user-abc',
  email: 'shebi@example.com',
  name: 'Shebi',
  role: 'PM',
};

const mockSearchResult = {
  results: [
    {
      threadId: 'aaaaaaaa-0000-4000-8000-000000000001',
      threadHeadline: 'Platform migration decision',
      summarySnippet: 'Team decided to migrate to Kubernetes',
      workstreamName: 'Platform',
      sourceThreadUrl: 'https://app.slack.com/client/T123/C456/thread/C456-123',
      relevanceScore: 0.82,
      matchType: 'BOTH' as const,
    },
  ],
  meta: { total: 1, query: 'kubernetes migration', searchTimeMs: 45 },
};

describe('SearchController', () => {
  let controller: SearchController;
  let mockSearchService: { search: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockSearchService = { search: vi.fn().mockResolvedValue(mockSearchResult) };

    const module = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('applies JwtAuthGuard at the controller class level (AC 7)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SearchController) as unknown[];
    expect(guards).toBeDefined();
    expect(guards?.[0]).toBe(JwtAuthGuard);
  });

  describe('POST /search', () => {
    it('returns { data: ... } envelope with results and meta (AC 3)', async () => {
      const result = await controller.search(mockUser, { query: 'kubernetes migration' });

      expect(result).toEqual({ data: mockSearchResult });
    });

    it('passes query and user role to SearchService.search (AC 1)', async () => {
      await controller.search(mockUser, { query: 'deploy pipeline' });

      expect(mockSearchService.search).toHaveBeenCalledWith('deploy pipeline', 'PM');
    });

    it('propagates user role — ARCHITECT gets technical summary path', async () => {
      const architectUser: AuthenticatedUser = { ...mockUser, role: 'ARCHITECT' };

      await controller.search(architectUser, { query: 'infrastructure' });

      expect(mockSearchService.search).toHaveBeenCalledWith('infrastructure', 'ARCHITECT');
    });

    it('propagates suggestions in response when returned by service (AC 5)', async () => {
      const noResultsResponse = {
        results: [],
        meta: { total: 0, query: 'nonexistent', searchTimeMs: 12 },
        suggestions: ['Try shorter query: "nonexistent"', 'Try different keywords'],
      };
      mockSearchService.search.mockResolvedValue(noResultsResponse);

      const result = await controller.search(mockUser, { query: 'nonexistent' });

      expect(result.data.suggestions).toEqual(noResultsResponse.suggestions);
    });

    it('calls SearchService.search with the trimmed query after Zod parse', async () => {
      const pipe = new ZodValidationPipe(searchRequestSchema);
      const parsed = pipe.transform({ query: '  kubernetes  ' }) as { query: string };

      await controller.search(mockUser, parsed);

      expect(mockSearchService.search).toHaveBeenCalledWith('kubernetes', 'PM');
    });
  });

  describe('ZodValidationPipe — searchRequestSchema (AC 7)', () => {
    let pipe: ZodValidationPipe;

    beforeEach(() => {
      pipe = new ZodValidationPipe(searchRequestSchema);
    });

    it('accepts valid query', () => {
      expect(() => pipe.transform({ query: 'valid query' })).not.toThrow();
    });

    it('rejects empty query', () => {
      expect(() => pipe.transform({ query: '' })).toThrow(BadRequestException);
    });

    it('rejects whitespace-only query', () => {
      expect(() => pipe.transform({ query: '   ' })).toThrow(BadRequestException);
    });

    it('rejects query exceeding 500 characters', () => {
      expect(() => pipe.transform({ query: 'a'.repeat(501) })).toThrow(BadRequestException);
    });

    it('accepts query exactly at 500 characters', () => {
      expect(() => pipe.transform({ query: 'a'.repeat(500) })).not.toThrow();
    });

    it('rejects missing query field', () => {
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });

    it('rejects non-string query', () => {
      expect(() => pipe.transform({ query: 42 })).toThrow(BadRequestException);
    });

    it('trims leading/trailing whitespace (Zod .trim())', () => {
      const parsed = pipe.transform({ query: '  trimmed  ' }) as { query: string };
      expect(parsed.query).toBe('trimmed');
    });
  });
});
