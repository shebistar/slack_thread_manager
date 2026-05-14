import { Module } from '@nestjs/common';
import { FtsService } from './fts.service.js';
import { VectorSearchService } from './vector-search.service.js';
import { HybridSearchService } from './hybrid-search.service.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';

@Module({
  imports: [PipelineModule],
  controllers: [SearchController],
  providers: [FtsService, VectorSearchService, HybridSearchService, SearchService],
  exports: [FtsService, VectorSearchService, HybridSearchService, SearchService],
})
export class SearchModule {}
