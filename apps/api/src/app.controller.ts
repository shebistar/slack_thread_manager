import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator.js';
import { PollingJob } from './modules/ingestion/polling.job.js';

@Controller()
export class AppController {
  constructor(private readonly pollingJob: PollingJob) {}

  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      lastBatchRun: this.pollingJob.getLastBatchRun()?.toISOString() ?? null,
      lastBatchStatus: this.pollingJob.getLastBatchStatus(),
    };
  }
}
