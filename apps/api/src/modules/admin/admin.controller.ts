import { Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LlmService } from '../pipeline/llm/llm.service.js';
import { CpuModelProvider } from '../pipeline/llm/providers/cpu-model.provider.js';
import { GeminiProvider } from '../pipeline/llm/providers/gemini.provider.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(CpuModelProvider) private readonly cpuProvider: CpuModelProvider,
    @Inject(GeminiProvider) private readonly geminiProvider: GeminiProvider,
    @Inject(PipelineService) private readonly pipelineService: PipelineService,
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
    const classification = await this.pipelineService.runClassification(date);
    const summarization = await this.pipelineService.runSummarization(date);
    const embedding = await this.pipelineService.runEmbedding(date);
    const correlation = await this.pipelineService.runCorrelation();
    return {
      data: {
        classification,
        summarization,
        embedding,
        correlation,
      },
    };
  }
}
