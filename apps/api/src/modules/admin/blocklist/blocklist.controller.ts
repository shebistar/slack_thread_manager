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
  Query,
} from '@nestjs/common';
import { BlocklistService } from './blocklist.service.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import {
  createBlocklistEntrySchema,
  updateBlocklistEntrySchema,
  blocklistListQuerySchema,
} from '@slack-thread-manager/shared';
import type {
  CreateBlocklistEntry,
  UpdateBlocklistEntry,
  BlocklistListQuery,
} from '@slack-thread-manager/shared';

@Controller('admin/blocklist')
@Roles('ADMIN')
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(blocklistListQuerySchema)) query: BlocklistListQuery,
  ) {
    const result = await this.blocklistService.list(query);
    return { data: result };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createBlocklistEntrySchema)) dto: CreateBlocklistEntry,
  ) {
    const entry = await this.blocklistService.create(dto);
    return { data: entry };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBlocklistEntrySchema)) dto: UpdateBlocklistEntry,
  ) {
    const entry = await this.blocklistService.update(id, dto);
    return { data: entry };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.blocklistService.remove(id);
  }
}
