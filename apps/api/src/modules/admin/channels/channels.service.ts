import { Inject, Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { slackChannels, workstreams } from '@slack-thread-manager/db';
import type { CreateChannel, UpdateChannel, Channel } from '@slack-thread-manager/shared';

export interface ChannelWithWorkstream extends Channel {
  workstreamName: string | null;
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async findAll(): Promise<ChannelWithWorkstream[]> {
    const result = await this.db.query.slackChannels.findMany({
      with: { workstream: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    });

    return result.map((c) => ({
      id: c.id,
      slackChannelId: c.slackChannelId,
      name: c.name,
      workstreamId: c.workstreamId,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
      workstreamName: c.workstream?.name ?? null,
    }));
  }

  async create(dto: CreateChannel): Promise<ChannelWithWorkstream> {
    this.logger.log('Creating channel');

    if (dto.workstreamId) {
      await this.validateWorkstreamId(dto.workstreamId);
    }

    try {
      const [channel] = await this.db
        .insert(slackChannels)
        .values({
          slackChannelId: dto.slackChannelId,
          name: dto.name,
          workstreamId: dto.workstreamId ?? null,
          isActive: dto.isActive ?? true,
        })
        .returning();

      return this.findById(channel.id);
    } catch (error: unknown) {
      this.throwIfUniqueViolation(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateChannel): Promise<ChannelWithWorkstream> {
    this.logger.log('Updating channel');

    if (dto.workstreamId) {
      await this.validateWorkstreamId(dto.workstreamId);
    }

    const nonEmptyFields = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(nonEmptyFields).length === 0) {
      return this.findById(id);
    }

    const [updated] = await this.db
      .update(slackChannels)
      .set(nonEmptyFields)
      .where(eq(slackChannels.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    return this.findById(id);
  }

  async toggleActive(id: string): Promise<ChannelWithWorkstream> {
    this.logger.log('Toggling channel active status');

    const existing = await this.db.query.slackChannels.findFirst({
      where: eq(slackChannels.id, id),
    });

    if (!existing) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    await this.db
      .update(slackChannels)
      .set({ isActive: !existing.isActive })
      .where(eq(slackChannels.id, id));

    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    this.logger.log('Removing channel');

    const [deleted] = await this.db
      .delete(slackChannels)
      .where(eq(slackChannels.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Channel ${id} not found`);
    }
  }

  private async validateWorkstreamId(id: string): Promise<void> {
    const found = await this.db
      .select({ id: workstreams.id })
      .from(workstreams)
      .where(eq(workstreams.id, id));

    if (found.length === 0) {
      throw new BadRequestException(`Invalid workstream ID: ${id}`);
    }
  }

  private throwIfUniqueViolation(error: unknown): void {
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      throw new ConflictException('A channel with this Slack ID already exists');
    }
  }

  private async findById(id: string): Promise<ChannelWithWorkstream> {
    const result = await this.db.query.slackChannels.findFirst({
      where: eq(slackChannels.id, id),
      with: { workstream: true },
    });

    if (!result) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    return {
      id: result.id,
      slackChannelId: result.slackChannelId,
      name: result.name,
      workstreamId: result.workstreamId,
      isActive: result.isActive,
      createdAt: result.createdAt.toISOString(),
      workstreamName: result.workstream?.name ?? null,
    };
  }
}
