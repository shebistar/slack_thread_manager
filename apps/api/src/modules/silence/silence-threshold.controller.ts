import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  updateGlobalThresholdSchema,
  upsertWorkstreamThresholdSchema,
} from '@slack-thread-manager/shared';
import type {
  UpdateGlobalThreshold,
  UpsertWorkstreamThreshold,
} from '@slack-thread-manager/shared';
import { SilenceService } from './silence.service.js';

@Controller('admin/silence/thresholds')
@Roles('ADMIN')
export class SilenceThresholdController {
  constructor(private readonly silenceService: SilenceService) {}

  @Get()
  async list() {
    const config = await this.silenceService.getThresholdConfiguration();
    return { data: config };
  }

  @Put('global')
  async updateGlobal(
    @Body(new ZodValidationPipe(updateGlobalThresholdSchema))
    dto: UpdateGlobalThreshold,
  ) {
    const global = await this.silenceService.updateGlobalThreshold(dto.thresholdDays);
    return { data: global };
  }

  @Put('workstream')
  async upsertWorkstream(
    @Body(new ZodValidationPipe(upsertWorkstreamThresholdSchema))
    dto: UpsertWorkstreamThreshold,
  ) {
    const threshold = await this.silenceService.upsertWorkstreamThreshold(
      dto.workstreamId,
      dto.thresholdDays,
    );
    return { data: threshold };
  }

  @Delete('workstream/:workstreamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWorkstream(
    @Param('workstreamId', ParseUUIDPipe) workstreamId: string,
  ): Promise<void> {
    await this.silenceService.removeWorkstreamThreshold(workstreamId);
  }
}
