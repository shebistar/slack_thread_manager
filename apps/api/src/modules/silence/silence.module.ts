import { Module } from '@nestjs/common';
import { SilenceService } from './silence.service.js';
import { SilenceJob } from './silence.job.js';

@Module({
  providers: [SilenceService, SilenceJob],
  exports: [SilenceService],
})
export class SilenceModule {}
