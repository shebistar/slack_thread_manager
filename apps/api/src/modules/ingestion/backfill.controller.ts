import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { BackfillService } from './backfill.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { backfillRequestSchema } from '@slack-thread-manager/shared';
import type { BackfillRequest } from '@slack-thread-manager/shared';

@Controller('admin/ingestion')
@Roles('ADMIN')
export class BackfillController {
  constructor(private readonly backfillService: BackfillService) {}

  @Post('backfill')
  @HttpCode(HttpStatus.ACCEPTED)
  startBackfill(
    @Body(new ZodValidationPipe(backfillRequestSchema)) body: BackfillRequest,
  ) {
    const { jobId } = this.backfillService.startBackfill(body);
    return { data: { jobId, status: 'pending' } };
  }

  @Get('backfill/:jobId')
  getBackfillStatus(@Param('jobId') jobId: string) {
    const status = this.backfillService.getBackfillStatus(jobId);
    if (!status) {
      throw new NotFoundException(`Backfill job not found: ${jobId}`);
    }
    return { data: status };
  }
}
