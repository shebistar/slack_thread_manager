import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { BriefingsService } from './briefings.service.js';
import { BriefingsController } from './briefings.controller.js';
import { BriefingGenerationJob } from './briefing-generation.job.js';

@Module({
  imports: [PipelineModule],
  controllers: [BriefingsController],
  providers: [BriefingsService, BriefingGenerationJob],
  exports: [BriefingsService],
})
export class BriefingsModule {}
