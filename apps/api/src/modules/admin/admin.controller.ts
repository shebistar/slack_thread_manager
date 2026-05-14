import { Controller, Get, Inject, Logger, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LlmService } from '../pipeline/llm/llm.service.js';
import { CpuModelProvider } from '../pipeline/llm/providers/cpu-model.provider.js';
import { GeminiProvider } from '../pipeline/llm/providers/gemini.provider.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { BriefingsService } from '../briefings/briefings.service.js';

const PIPELINE_TIMEOUT_MS = 240_000; // 4 min (below OpenShift 300s route timeout)

type StageResult<T = unknown> =
  | { status: 'ok'; durationMs: number; result: T }
  | { status: 'error'; durationMs: number; error: string }
  | { status: 'skipped'; reason: string };

async function runStage<T>(name: string, fn: () => Promise<T>, logger: Logger): Promise<StageResult<T>> {
  const start = Date.now();
  try {
    const result = await fn();
    return { status: 'ok', durationMs: Date.now() - start, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Pipeline stage "${name}" failed`, msg);
    return { status: 'error', durationMs: Date.now() - start, error: msg };
  }
}

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(CpuModelProvider) private readonly cpuProvider: CpuModelProvider,
    @Inject(GeminiProvider) private readonly geminiProvider: GeminiProvider,
    @Inject(PipelineService) private readonly pipelineService: PipelineService,
    private readonly briefingsService: BriefingsService,
    private readonly configService: ConfigService,
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
    const pipelineStart = Date.now();
    const timeoutMs = this.configService.get<number>('PIPELINE_TIMEOUT_MS', PIPELINE_TIMEOUT_MS);

    const elapsed = () => Date.now() - pipelineStart;
    const timedOut = () => elapsed() >= timeoutMs;

    const classification = await runStage('classification',
      () => this.pipelineService.runClassification(date), this.logger);

    const summarization = timedOut()
      ? { status: 'skipped' as const, reason: 'timeout' }
      : await runStage('summarization',
          () => this.pipelineService.runSummarization(date), this.logger);

    const embedding = timedOut()
      ? { status: 'skipped' as const, reason: 'timeout' }
      : await runStage('embedding',
          () => this.pipelineService.runEmbedding(date), this.logger);

    const correlation = timedOut()
      ? { status: 'skipped' as const, reason: 'timeout' }
      : await runStage('correlation',
          () => this.pipelineService.runCorrelation(), this.logger);

    const blocklistFilter = timedOut()
      ? { status: 'skipped' as const, reason: 'timeout' }
      : await runStage('blocklistFilter',
          () => this.pipelineService.runBlocklistFilter(), this.logger);

    let entityDetection: StageResult;
    if (blocklistFilter.status !== 'ok') {
      entityDetection = { status: 'skipped', reason: 'blocklistFilter did not complete' };
    } else {
      const hasFlaggedThreads = blocklistFilter.result.results.some((r) => r.flags.length > 0);
      if (!hasFlaggedThreads) {
        entityDetection = { status: 'skipped', reason: 'no blocklist flags detected' };
      } else if (timedOut()) {
        entityDetection = { status: 'skipped', reason: 'timeout' };
      } else {
        entityDetection = await runStage('entityDetection',
          () => this.pipelineService.runLlmEntityDetection(blocklistFilter.result.results),
          this.logger);
      }
    }

    let staging: StageResult;
    if (blocklistFilter.status !== 'ok') {
      staging = { status: 'skipped', reason: 'blocklistFilter did not complete' };
    } else if (timedOut()) {
      staging = { status: 'skipped', reason: 'timeout' };
    } else {
      const entityResults = entityDetection.status === 'ok'
        ? (entityDetection.result as { results: typeof blocklistFilter.result.results }).results
        : [];
      const flaggedIds = new Set(entityResults.map((r) => r.threadId));
      const unflaggedResults = blocklistFilter.result.results.filter(
        (r) => !flaggedIds.has(r.threadId),
      );
      const allResults = [...entityResults, ...unflaggedResults];
      staging = await runStage('staging',
        () => this.pipelineService.runStaging(allResults), this.logger);
    }

    const totalDurationMs = elapsed();
    return {
      data: {
        classification,
        summarization,
        embedding,
        correlation,
        blocklistFilter,
        entityDetection,
        staging,
        _meta: { totalDurationMs, timedOut: timedOut(), timeoutMs },
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
