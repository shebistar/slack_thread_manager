import { Module } from '@nestjs/common';
import { CpuModelProvider } from './providers/cpu-model.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { LlmService } from './llm.service.js';

@Module({
  providers: [CpuModelProvider, GeminiProvider, LlmService],
  exports: [LlmService, CpuModelProvider, GeminiProvider],
})
export class LlmModule {}
