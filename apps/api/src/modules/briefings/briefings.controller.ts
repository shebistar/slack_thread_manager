import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
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
