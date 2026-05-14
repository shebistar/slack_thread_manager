import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { asc, desc, eq, ilike, and, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { anonymizationBlocklist } from '@slack-thread-manager/db';
import type {
  CreateBlocklistEntry,
  UpdateBlocklistEntry,
  BlocklistListQuery,
  BlocklistEntryResponse,
  BlocklistListResponse,
} from '@slack-thread-manager/shared';

@Injectable()
export class BlocklistService {
  private readonly logger = new Logger(BlocklistService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async list(query: BlocklistListQuery): Promise<BlocklistListResponse> {
    const conditions = [];

    if (query.search) {
      conditions.push(ilike(anonymizationBlocklist.term, `%${query.search}%`));
    }
    if (query.category) {
      conditions.push(eq(anonymizationBlocklist.category, query.category));
    }

    const orderColumn = query.sortBy === 'term'
      ? anonymizationBlocklist.term
      : query.sortBy === 'category'
        ? anonymizationBlocklist.category
        : anonymizationBlocklist.createdAt;

    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(anonymizationBlocklist)
      .where(whereClause)
      .orderBy(orderFn(orderColumn));

    const items: BlocklistEntryResponse[] = rows.map((r) => ({
      id: r.id,
      term: r.term,
      replacement: r.replacement,
      category: r.category,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, total: items.length };
  }

  async create(dto: CreateBlocklistEntry): Promise<BlocklistEntryResponse> {
    this.logger.log('Creating blocklist entry', { term: dto.term });

    try {
      const [row] = await this.db
        .insert(anonymizationBlocklist)
        .values({
          term: dto.term,
          replacement: dto.replacement,
          category: dto.category,
        })
        .returning();

      if (!row) {
        throw new Error('Insert returned no rows');
      }

      return {
        id: row.id,
        term: row.term,
        replacement: row.replacement,
        category: row.category,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        throw new ConflictException(`Blocklist entry with term "${dto.term}" already exists`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBlocklistEntry): Promise<BlocklistEntryResponse> {
    this.logger.log('Updating blocklist entry', { id });

    const updateFields: Record<string, unknown> = {};
    if (dto.term !== undefined) updateFields.term = dto.term;
    if (dto.replacement !== undefined) updateFields.replacement = dto.replacement;
    if (dto.category !== undefined) updateFields.category = dto.category;

    try {
      const [row] = await this.db
        .update(anonymizationBlocklist)
        .set(updateFields)
        .where(eq(anonymizationBlocklist.id, id))
        .returning();

      if (!row) {
        throw new NotFoundException(`Blocklist entry ${id} not found`);
      }

      return {
        id: row.id,
        term: row.term,
        replacement: row.replacement,
        category: row.category,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      const code = (error as { code?: string })?.code;
      if (code === '23505') {
        throw new ConflictException(`Blocklist entry with term "${dto.term}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log('Removing blocklist entry', { id });

    const [deleted] = await this.db
      .delete(anonymizationBlocklist)
      .where(eq(anonymizationBlocklist.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Blocklist entry ${id} not found`);
    }
  }
}
