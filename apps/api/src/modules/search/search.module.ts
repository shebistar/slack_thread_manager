import { Module } from '@nestjs/common';
import { FtsService } from './fts.service.js';
import { VectorSearchService } from './vector-search.service.js';
import { HybridSearchService } from './hybrid-search.service.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';

@Module({
  imports: [PipelineModule],
  providers: [FtsService, VectorSearchService, HybridSearchService],
  exports: [FtsService, VectorSearchService, HybridSearchService],
})
export class SearchModule {}
