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
import { RosterService } from './roster.service.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import {
  createRosterMemberSchema,
  updateRosterMemberSchema,
} from '@slack-thread-manager/shared';
import type {
  CreateRosterMember,
  UpdateRosterMember,
} from '@slack-thread-manager/shared';

@Controller('admin/roster')
@Roles('ADMIN')
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Get()
  async findAll() {
    const members = await this.rosterService.findAll();
    return { data: members };
  }

  @Get('workstreams')
  async findAllWorkstreams() {
    const ws = await this.rosterService.findAllWorkstreams();
    return { data: ws };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createRosterMemberSchema)) dto: CreateRosterMember,
  ) {
    const member = await this.rosterService.create(dto);
    return { data: member };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRosterMemberSchema)) dto: UpdateRosterMember,
  ) {
    const member = await this.rosterService.update(id, dto);
    return { data: member };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rosterService.remove(id);
  }
}
