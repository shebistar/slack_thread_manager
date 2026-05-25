import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import type { Database } from '@slack-thread-manager/db';
import { users } from '@slack-thread-manager/db';
import { StagingService } from './staging.service.js';

@Controller('admin/staging')
@Roles('ADMIN')
export class StagingController {
  private readonly logger = new Logger(StagingController.name);

  constructor(
    private readonly stagingService: StagingService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  private async resolveInternalUserId(user: AuthenticatedUser): Promise<string> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email));

    if (row) return row.id;

    this.logger.warn(
      `No internal user found for ${user.email} (sub=${user.sub}), falling back to sub`,
    );
    return user.sub;
  }

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
    const reviewerId = await this.resolveInternalUserId(req.user);
    const result = await this.stagingService.reviewItem(id, body.action, reviewerId);
    return { data: result };
  }

  @Post('approve-all-clean')
  @HttpCode(HttpStatus.OK)
  async approveAllClean(
    @Body(new ZodValidationPipe(approveAllCleanRequestSchema)) body: ApproveAllCleanRequest,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const reviewerId = await this.resolveInternalUserId(req.user);
    const result = await this.stagingService.approveAllClean(body, reviewerId);
    return { data: result };
  }

  @Get('batches/:batchId')
  async getBatchProgress(@Param('batchId', ParseUUIDPipe) batchId: string) {
    const result = await this.stagingService.getBatchProgress(batchId);
    return { data: result };
  }
}
