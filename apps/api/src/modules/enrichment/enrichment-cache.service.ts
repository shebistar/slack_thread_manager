import { Injectable, Logger } from '@nestjs/common';
import type { EnrichmentResponse } from '@slack-thread-manager/shared';

interface CacheEntry {
  response: EnrichmentResponse;
  dateKey: string;
}

@Injectable()
export class EnrichmentCacheService {
  private readonly logger = new Logger(EnrichmentCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();

  get(threadId: string): EnrichmentResponse | null {
    const dateKey = this.todayKey();
    const entry = this.cache.get(threadId);

    if (!entry || entry.dateKey !== dateKey) {
      if (entry) {
        this.cache.delete(threadId);
      }
      return null;
    }

    this.logger.debug('Cache hit', { threadId, dateKey });
    return entry.response;
  }

  set(threadId: string, response: EnrichmentResponse): void {
    const dateKey = this.todayKey();
    this.cache.set(threadId, { response, dateKey });
    this.logger.debug('Cache set', { threadId, dateKey });
  }

  invalidate(threadId: string): void {
    this.cache.delete(threadId);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
