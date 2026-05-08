import { Module } from '@nestjs/common';
import { SlackClientService } from './slack-client.service.js';
import { SlackController } from './slack.controller.js';

@Module({
  controllers: [SlackController],
  providers: [SlackClientService],
  exports: [SlackClientService],
})
export class SlackModule {}
