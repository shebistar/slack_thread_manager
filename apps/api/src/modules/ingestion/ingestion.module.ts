import { Module } from '@nestjs/common';
import { SlackModule } from '../slack/slack.module.js';
import { IngestionService } from './ingestion.service.js';
import { ImportService } from './import.service.js';
import { ImportController } from './import.controller.js';
import { BackfillService } from './backfill.service.js';
import { BackfillController } from './backfill.controller.js';
import { PollingJob } from './polling.job.js';
import { SilenceModule } from '../silence/silence.module.js';

@Module({
  imports: [SlackModule, SilenceModule],
  controllers: [ImportController, BackfillController],
  providers: [IngestionService, ImportService, BackfillService, PollingJob],
  exports: [IngestionService, ImportService, BackfillService, PollingJob],
})
export class IngestionModule {}
