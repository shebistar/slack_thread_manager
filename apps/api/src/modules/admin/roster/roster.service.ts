import { Inject, Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { users, workstreams, userWorkstreams } from '@slack-thread-manager/db';
import type { CreateRosterMember, UpdateRosterMember, RosterMember, Workstream } from '@slack-thread-manager/shared';

@Injectable()
export class RosterService {
  private readonly logger = new Logger(RosterService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async findAll(): Promise<RosterMember[]> {
    const result = await this.db.query.users.findMany({
      with: {
        userWorkstreams: {
          with: { workstream: true },
        },
      },
      orderBy: (u, { asc }) => [asc(u.displayName)],
    });

    return result.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      slackHandle: u.slackHandle,
      slackNicknames: u.slackNicknames,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      workstreams: u.userWorkstreams.map((uw) => ({
        id: uw.workstream.id,
        name: uw.workstream.name,
      })),
    }));
  }

  async findAllWorkstreams(): Promise<Workstream[]> {
    const result = await this.db
      .select()
      .from(workstreams)
      .orderBy(workstreams.name);

    return result.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description ?? null,
      createdAt: w.createdAt.toISOString(),
    }));
  }

  async create(dto: CreateRosterMember): Promise<RosterMember> {
    this.logger.log('Creating roster member');
    const { workstreamIds, ...userFields } = dto;

    await this.validateWorkstreamIds(workstreamIds);

    try {
      const result = await this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email: userFields.email,
            displayName: userFields.displayName,
            slackHandle: userFields.slackHandle,
            slackNicknames: userFields.slackNicknames ?? [],
            role: userFields.role,
            updatedAt: new Date(),
          })
          .returning();

        if (workstreamIds.length > 0) {
          await tx.insert(userWorkstreams).values(
            workstreamIds.map((wId) => ({ userId: user.id, workstreamId: wId })),
          );
        }

        return user;
      });

      return await this.findById(result.id);
    } catch (error: unknown) {
      this.throwIfUniqueViolation(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateRosterMember): Promise<RosterMember> {
    this.logger.log('Updating roster member');
    const { workstreamIds, ...updateFields } = dto;

    if (workstreamIds !== undefined) {
      await this.validateWorkstreamIds(workstreamIds);
    }

    try {
      await this.db.transaction(async (tx) => {
        const nonEmptyFields = Object.fromEntries(
          Object.entries(updateFields).filter(([, v]) => v !== undefined),
        );

        if (Object.keys(nonEmptyFields).length > 0) {
          const [updated] = await tx
            .update(users)
            .set({ ...nonEmptyFields, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning();

          if (!updated) {
            throw new NotFoundException(`User ${id} not found`);
          }
        } else {
          const existing = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
          if (existing.length === 0) {
            throw new NotFoundException(`User ${id} not found`);
          }
        }

        if (workstreamIds !== undefined) {
          await tx.delete(userWorkstreams).where(eq(userWorkstreams.userId, id));
          if (workstreamIds.length > 0) {
            await tx.insert(userWorkstreams).values(
              workstreamIds.map((wId) => ({ userId: id, workstreamId: wId })),
            );
          }
        }
      });

      return this.findById(id);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      this.throwIfUniqueViolation(error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log('Removing roster member');

    await this.db.transaction(async (tx) => {
      await tx.delete(userWorkstreams).where(eq(userWorkstreams.userId, id));
      const [deleted] = await tx.delete(users).where(eq(users.id, id)).returning();
      if (!deleted) {
        throw new NotFoundException(`User ${id} not found`);
      }
    });
  }

  private async validateWorkstreamIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.db
      .select({ id: workstreams.id })
      .from(workstreams)
      .where(inArray(workstreams.id, ids));
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((r) => r.id));
      const invalid = ids.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Invalid workstream IDs: ${invalid.join(', ')}`);
    }
  }

  private throwIfUniqueViolation(error: unknown): void {
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      throw new ConflictException('A user with this email already exists');
    }
  }

  private async findById(id: string): Promise<RosterMember> {
    const result = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        userWorkstreams: {
          with: { workstream: true },
        },
      },
    });

    if (!result) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return {
      id: result.id,
      email: result.email,
      displayName: result.displayName,
      slackHandle: result.slackHandle,
      slackNicknames: result.slackNicknames,
      role: result.role,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      workstreams: result.userWorkstreams.map((uw) => ({
        id: uw.workstream.id,
        name: uw.workstream.name,
      })),
    };
  }
}
