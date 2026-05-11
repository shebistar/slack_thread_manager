import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BriefingsService } from './briefings.service.js';

@Injectable()
export class BriefingGenerationJob {
  private readonly logger = new Logger(BriefingGenerationJob.name);

  constructor(
    private readonly briefingsService: BriefingsService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(process.env['BRIEFING_CRON_SCHEDULE'] || '0 4 * * *', {
    name: 'briefing-generation',
  })
  async handleBriefingGeneration(): Promise<void> {
    this.logger.log('Briefing generation cron triggered');

    try {
      const result = await this.briefingsService.generateBriefingsForAllUsers();
      this.logger.log('Briefing generation cron completed', result);
    } catch (error) {
      this.logger.error('Briefing generation cron failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}
