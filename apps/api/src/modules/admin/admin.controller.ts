import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LlmService } from '../pipeline/llm/llm.service.js';
import { CpuModelProvider } from '../pipeline/llm/providers/cpu-model.provider.js';
import { GeminiProvider } from '../pipeline/llm/providers/gemini.provider.js';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly llmService: LlmService,
    private readonly cpuProvider: CpuModelProvider,
    private readonly geminiProvider: GeminiProvider,
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
}
