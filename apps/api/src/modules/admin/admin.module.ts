import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { RosterController } from './roster/roster.controller.js';
import { RosterService } from './roster/roster.service.js';
import { ChannelsController } from './channels/channels.controller.js';
import { ChannelsService } from './channels/channels.service.js';
import { StagingController } from './staging/staging.controller.js';
import { StagingService } from './staging/staging.service.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';

@Module({
  imports: [PipelineModule],
  controllers: [AdminController, RosterController, ChannelsController, StagingController],
  providers: [RosterService, ChannelsService, StagingService],
})
export class AdminModule {}
