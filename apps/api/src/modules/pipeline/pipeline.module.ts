import { Module } from '@nestjs/common';
import { LlmModule } from './llm/llm.module.js';
import { PipelineStateService } from './pipeline-state.service.js';
import { PipelineRunService } from './pipeline-run.service.js';
import { ClassifierProcessor } from './processors/classifier.processor.js';
import { SummarizerProcessor } from './processors/summarizer.processor.js';
import { EmbedderProcessor } from './processors/embedder.processor.js';
import { CorrelatorProcessor } from './processors/correlator.processor.js';
import { BlocklistFilterProcessor } from './anonymization/blocklist-filter.processor.js';
import { LlmEntityDetectorProcessor } from './anonymization/llm-entity-detector.processor.js';
import { PipelineService } from './pipeline.service.js';

@Module({
  imports: [LlmModule],
  providers: [PipelineStateService, PipelineRunService, ClassifierProcessor, SummarizerProcessor, EmbedderProcessor, CorrelatorProcessor, BlocklistFilterProcessor, LlmEntityDetectorProcessor, PipelineService],
  exports: [LlmModule, PipelineStateService, PipelineRunService, PipelineService],
})
export class PipelineModule {}
