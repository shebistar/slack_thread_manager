import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BriefingsService } from './briefings.service.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Controller('briefings')
@UseGuards(JwtAuthGuard)
export class BriefingsController {
  private readonly logger = new Logger(BriefingsController.name);

  constructor(private readonly briefingsService: BriefingsService) {}

  @Get('today')
  async getTodayBriefing(@CurrentUser() user: AuthenticatedUser) {
    this.logger.log(`Fetching today's briefing for user ${user.sub}`);
    const result = await this.briefingsService.getTodayBriefing(user.sub);
    return { data: result };
  }
}
