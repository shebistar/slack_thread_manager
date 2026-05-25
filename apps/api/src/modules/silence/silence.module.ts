import { Module } from '@nestjs/common';
import { SilenceService } from './silence.service.js';
import { SilenceJob } from './silence.job.js';
import { SilenceThresholdController } from './silence-threshold.controller.js';
import { SilenceAlertController } from './silence-alert.controller.js';

@Module({
  controllers: [SilenceThresholdController, SilenceAlertController],
  providers: [SilenceService, SilenceJob],
  exports: [SilenceService],
})
export class SilenceModule {}
