import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { BriefingsService } from './briefings.service.js';
import { BriefingGenerationJob } from './briefing-generation.job.js';

@Module({
  imports: [PipelineModule],
  providers: [BriefingsService, BriefingGenerationJob],
  exports: [BriefingsService],
})
export class BriefingsModule {}
