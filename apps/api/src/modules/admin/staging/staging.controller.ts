import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import {
  stagingQueueFilterSchema,
  reviewStagingItemSchema,
  approveAllCleanRequestSchema,
} from '@slack-thread-manager/shared';
import type {
  StagingQueueFilter,
  ReviewStagingItem,
  ApproveAllCleanRequest,
  AuthenticatedUser,
} from '@slack-thread-manager/shared';
import { StagingService } from './staging.service.js';

@Controller('admin/staging')
@Roles('ADMIN')
export class StagingController {
  constructor(private readonly stagingService: StagingService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(stagingQueueFilterSchema)) filters: StagingQueueFilter,
  ) {
    const result = await this.stagingService.listPending(filters);
    return { data: result };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  async reviewItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewStagingItemSchema)) body: ReviewStagingItem,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const result = await this.stagingService.reviewItem(id, body.action, req.user.sub);
    return { data: result };
  }

  @Post('approve-all-clean')
  @HttpCode(HttpStatus.OK)
  async approveAllClean(
    @Body(new ZodValidationPipe(approveAllCleanRequestSchema)) body: ApproveAllCleanRequest,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const result = await this.stagingService.approveAllClean(body, req.user.sub);
    return { data: result };
  }

  @Get('batches/:batchId')
  async getBatchProgress(@Param('batchId', ParseUUIDPipe) batchId: string) {
    const result = await this.stagingService.getBatchProgress(batchId);
    return { data: result };
  }
}
