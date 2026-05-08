import { Module } from '@nestjs/common';
import { LlmModule } from './llm/llm.module.js';
import { PipelineStateService } from './pipeline-state.service.js';
import { PipelineRunService } from './pipeline-run.service.js';

@Module({
  imports: [LlmModule],
  providers: [PipelineStateService, PipelineRunService],
  exports: [LlmModule, PipelineStateService, PipelineRunService],
})
export class PipelineModule {}
