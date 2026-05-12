import { Controller, Get, Inject, Logger, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LlmService } from '../pipeline/llm/llm.service.js';
import { CpuModelProvider } from '../pipeline/llm/providers/cpu-model.provider.js';
import { GeminiProvider } from '../pipeline/llm/providers/gemini.provider.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { BriefingsService } from '../briefings/briefings.service.js';

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(CpuModelProvider) private readonly cpuProvider: CpuModelProvider,
    @Inject(GeminiProvider) private readonly geminiProvider: GeminiProvider,
    @Inject(PipelineService) private readonly pipelineService: PipelineService,
    private readonly briefingsService: BriefingsService,
  ) {}

  @Get('health')
  @Roles('ADMIN')
  getAdminHealth() {
    return { data: { status: 'admin-ok' } };
  }

  @Get('llm/health')
  @Roles('ADMIN')
  async getLlmHealth() {
    const [cpuOk, geminiOk] = await Promise.all([
      this.cpuProvider.healthCheck(),
      this.geminiProvider.healthCheck(),
    ]);
    return {
      data: {
        cpu: { healthy: cpuOk },
        gemini: { healthy: geminiOk },
        status: cpuOk || geminiOk ? 'ok' : 'degraded',
      },
    };
  }

  @Post('pipeline/run')
  @Roles('ADMIN')
  async runPipeline(@Query('date') date?: string) {
    const logger = new Logger('AdminController');

    const classification = await this.pipelineService.runClassification(date);
    const summarization = await this.pipelineService.runSummarization(date);
    const embedding = await this.pipelineService.runEmbedding(date);

    let correlation = null;
    try {
      correlation = await this.pipelineService.runCorrelation();
    } catch (err) {
      logger.warn('Correlation step failed (non-blocking)', err instanceof Error ? err.message : err);
      correlation = { error: err instanceof Error ? err.message : 'unknown error' };
    }

    const blocklistFilter = await this.pipelineService.runBlocklistFilter();

    let entityDetection = { threadsProcessed: 0, entitiesDetected: 0, results: [] as typeof blocklistFilter.results };
    const hasFlaggedThreads = blocklistFilter.results.some((r) => r.flags.length > 0);

    if (hasFlaggedThreads) {
      entityDetection = await this.pipelineService.runLlmEntityDetection(
        blocklistFilter.results,
      );
    } else {
      logger.log('No blocklist flags detected — skipping LLM entity detection');
    }

    const flaggedIds = new Set(entityDetection.results.map((r) => r.threadId));
    const unflaggedResults = blocklistFilter.results.filter(
      (r) => !flaggedIds.has(r.threadId),
    );
    const allResults = [...entityDetection.results, ...unflaggedResults];
    const staging = await this.pipelineService.runStaging(allResults);

    return {
      data: {
        classification,
        summarization,
        embedding,
        correlation,
        blocklistFilter,
        entityDetection,
        staging,
      },
    };
  }

  @Post('briefings/generate')
  @Roles('ADMIN')
  async generateBriefings() {
    const result = await this.briefingsService.generateBriefingsForAllUsers();
    return { data: result };
  }
}
