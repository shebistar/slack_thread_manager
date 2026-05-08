import { Module } from '@nestjs/common';
import { SlackModule } from '../slack/slack.module.js';
import { IngestionService } from './ingestion.service.js';
import { ImportService } from './import.service.js';
import { ImportController } from './import.controller.js';

@Module({
  imports: [SlackModule],
  controllers: [ImportController],
  providers: [IngestionService, ImportService],
  exports: [IngestionService, ImportService],
})
export class IngestionModule {}
