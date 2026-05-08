import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { RosterController } from './roster/roster.controller.js';
import { RosterService } from './roster/roster.service.js';
import { ChannelsController } from './channels/channels.controller.js';
import { ChannelsService } from './channels/channels.service.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';

@Module({
  imports: [PipelineModule],
  controllers: [AdminController, RosterController, ChannelsController],
  providers: [RosterService, ChannelsService],
})
export class AdminModule {}
