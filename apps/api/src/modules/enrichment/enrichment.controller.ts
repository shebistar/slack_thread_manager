import { Controller, Get, Logger, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { EnrichmentService } from './enrichment.service.js';

@Controller('enrichment')
@Roles('ARCHITECT', 'CONSULTANT')
export class EnrichmentController {
  private readonly logger = new Logger(EnrichmentController.name);

  constructor(private readonly enrichmentService: EnrichmentService) {}

  @Get(':threadId')
  async getEnrichment(@Param('threadId', ParseUUIDPipe) threadId: string) {
    this.logger.debug('Enrichment endpoint called', { threadId });

    const result = await this.enrichmentService.getEnrichment(threadId);

    return { data: result };
  }
}
