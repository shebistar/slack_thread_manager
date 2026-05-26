import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { EnrichmentController } from './enrichment.controller.js';
import { EnrichmentService } from './enrichment.service.js';
import { EnrichmentCacheService } from './enrichment-cache.service.js';
import { NotebookLmSource } from './notebooklm.source.js';
import { OpenShiftDocsSource } from './openshift-docs.source.js';
import { SimilarDiscussionsSource } from './similar-discussions.source.js';
import { ENRICHMENT_SOURCES } from './enrichment-source.interface.js';

@Module({
  imports: [PipelineModule],
  controllers: [EnrichmentController],
  providers: [
    NotebookLmSource,
    OpenShiftDocsSource,
    SimilarDiscussionsSource,
    {
      provide: ENRICHMENT_SOURCES,
      useFactory: (
        notebookLm: NotebookLmSource,
        openshiftDocs: OpenShiftDocsSource,
        similarDiscussions: SimilarDiscussionsSource,
      ) => [notebookLm, openshiftDocs, similarDiscussions],
      inject: [NotebookLmSource, OpenShiftDocsSource, SimilarDiscussionsSource],
    },
    EnrichmentCacheService,
    EnrichmentService,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
