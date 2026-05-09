import { Module } from '@nestjs/common';
import { LlmModule } from './llm/llm.module.js';
import { PipelineStateService } from './pipeline-state.service.js';
import { PipelineRunService } from './pipeline-run.service.js';
import { ClassifierProcessor } from './processors/classifier.processor.js';
import { SummarizerProcessor } from './processors/summarizer.processor.js';
import { EmbedderProcessor } from './processors/embedder.processor.js';
import { PipelineService } from './pipeline.service.js';

@Module({
  imports: [LlmModule],
  providers: [PipelineStateService, PipelineRunService, ClassifierProcessor, SummarizerProcessor, EmbedderProcessor, PipelineService],
  exports: [LlmModule, PipelineStateService, PipelineRunService, PipelineService],
})
export class PipelineModule {}
