import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ImportService } from './import.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { importRequestSchema } from '@slack-thread-manager/shared';
import type { ImportRequest } from '@slack-thread-manager/shared';

@Controller('admin/channels')
@Roles('ADMIN')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post(':id/import')
  @HttpCode(HttpStatus.OK)
  async importHistory(
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(importRequestSchema)) body: ImportRequest,
  ) {
    const summary = await this.importService.importMessages(
      channelId,
      body.slackTeamId,
      body.messages,
    );
    return { data: summary };
  }
}
