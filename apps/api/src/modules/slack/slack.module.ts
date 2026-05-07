import { Module } from '@nestjs/common';
import { SlackClientService } from './slack-client.service.js';

@Module({
  providers: [SlackClientService],
  exports: [SlackClientService],
})
export class SlackModule {}
