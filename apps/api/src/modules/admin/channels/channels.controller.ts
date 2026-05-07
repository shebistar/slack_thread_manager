import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import {
  createChannelSchema,
  updateChannelSchema,
} from '@slack-thread-manager/shared';
import type {
  CreateChannel,
  UpdateChannel,
} from '@slack-thread-manager/shared';

@Controller('admin/channels')
@Roles('ADMIN')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async findAll() {
    const channels = await this.channelsService.findAll();
    return { data: channels };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createChannelSchema)) dto: CreateChannel,
  ) {
    const channel = await this.channelsService.create(dto);
    return { data: channel };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) dto: UpdateChannel,
  ) {
    const channel = await this.channelsService.update(id, dto);
    return { data: channel };
  }

  @Patch(':id/toggle')
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    const channel = await this.channelsService.toggleActive(id);
    return { data: channel };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.channelsService.remove(id);
  }
}
