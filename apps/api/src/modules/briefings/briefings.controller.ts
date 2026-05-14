import { Controller, Get, HttpCode, HttpStatus, Logger, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BriefingsService } from './briefings.service.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Controller('briefings')
@UseGuards(JwtAuthGuard)
export class BriefingsController {
  private readonly logger = new Logger(BriefingsController.name);

  constructor(
    private readonly briefingsService: BriefingsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('today')
  async getTodayBriefing(@CurrentUser() user: AuthenticatedUser) {
    this.logger.debug(`Fetching today's briefing for role ${user.role}`);
    const result = await this.briefingsService.getTodayBriefing(user.sub, user.email);
    if (!result) return { data: null };

    return {
      data: {
        ...result,
        nextBatchScheduledAt: this.getNextBriefingRunIso(),
      },
    };
  }

  @Post('items/:itemId/read')
  @HttpCode(HttpStatus.CREATED)
  async markItemRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    const userId = await this.briefingsService.resolveUserIdFromAuth(user.sub, user.email);
    if (!userId) {
      throw new NotFoundException('User not found');
    }

    const result = await this.briefingsService.markItemAsRead(userId, itemId);
    return {
      data: {
        briefingItemId: result.briefingItemId,
        readAt: result.readAt.toISOString(),
      },
    };
  }

  @Get('history')
  async getBriefingHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    const userId = await this.briefingsService.resolveUserIdFromAuth(user.sub, user.email);
    if (!userId) {
      throw new NotFoundException('User not found');
    }

    const effectiveDays = Math.min(30, Math.max(1, days ?? 7));
    const briefings = await this.briefingsService.getBriefingHistory(userId, effectiveDays);

    return {
      data: {
        briefings: briefings.map((briefing) => ({
          ...briefing,
          briefingShape: briefing.briefingShape.toUpperCase(),
          briefingDate: briefing.briefingDate.toISOString(),
          generatedAt: briefing.generatedAt.toISOString(),
        })),
      },
    };
  }

  @Get(':id')
  async getBriefingById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = await this.briefingsService.resolveUserIdFromAuth(user.sub, user.email);
    if (!userId) {
      throw new NotFoundException('User not found');
    }

    const result = await this.briefingsService.getBriefingById(userId, id);
    if (!result) {
      throw new NotFoundException('Briefing not found');
    }

    return {
      data: {
        briefing: {
          ...result.briefing,
          briefingShape: result.briefing.briefingShape.toUpperCase(),
          briefingDate: result.briefing.briefingDate.toISOString(),
          generatedAt: result.briefing.generatedAt.toISOString(),
        },
        items: result.items.map((item) => ({
          ...item,
          itemType: item.itemType.toUpperCase(),
        })),
        readItemIds: result.readItemIds,
      },
    };
  }

  private getNextBriefingRunIso(): string | null {
    const schedule = this.configService.get<string>('BRIEFING_CRON_SCHEDULE') ?? '0 4 * * *';
    const [minuteField, hourField] = schedule.trim().split(/\s+/);
    const minute = Number(minuteField);
    const hour = Number(hourField);

    if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;

    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.toISOString();
  }
}
