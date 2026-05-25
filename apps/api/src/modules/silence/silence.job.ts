import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SilenceService } from './silence.service.js';

@Injectable()
export class SilenceJob {
  private readonly logger = new Logger(SilenceJob.name);

  constructor(private readonly silenceService: SilenceService) {}

  @Cron('30 */4 * * *', { name: 'silence-detection', timeZone: 'UTC' })
  async handleSilenceDetectionCron(): Promise<void> {
    this.logger.log('Scheduled silence detection starting');

    try {
      const summary = await this.silenceService.runDetection();
      this.logger.log('Scheduled silence detection completed', summary);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Scheduled silence detection failed', { error: msg });
    }
  }

  async runDetection() {
    return this.silenceService.runDetection();
  }
}
