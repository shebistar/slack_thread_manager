import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { SilenceService } from './silence.service.js';

@Controller('silence/alerts')
export class SilenceAlertController {
  constructor(private readonly silenceService: SilenceService) {}

  @Get()
  async listActive() {
    const result = await this.silenceService.getActiveAlerts();
    return { data: result };
  }

  @Patch(':id/dismiss')
  async dismiss(@Param('id', ParseUUIDPipe) id: string) {
    await this.silenceService.dismissAlert(id);
    return { data: { id, status: 'dismissed' } };
  }
}
