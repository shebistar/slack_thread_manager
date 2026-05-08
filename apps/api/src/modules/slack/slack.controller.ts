import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { SlackClientService } from './slack-client.service.js';

@Controller('slack')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SlackController {
  constructor(private readonly slackClient: SlackClientService) {}

  @Get('status')
  async getStatus() {
    const configured = this.slackClient.isConfigured();
    if (!configured) {
      return {
        configured: false,
        connected: false,
        message: 'SLACK_BOT_TOKEN not set — Slack integration disabled',
      };
    }

    const result = await this.slackClient.testConnection();
    return {
      configured: true,
      connected: result.ok,
      team: result.team,
      error: result.error,
    };
  }

  @Get('channels/:channelId')
  async getChannelInfo(@Param('channelId') channelId: string) {
    return this.slackClient.fetchChannelInfo(channelId);
  }

  @Get('channels/:channelId/history')
  async getChannelHistory(
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.slackClient.fetchChannelHistory(channelId, {
      limit: limit ? parseInt(limit, 10) : 20,
      cursor: cursor || undefined,
    });
  }

  @Get('channels/:channelId/threads/:threadTs')
  async getThreadReplies(
    @Param('channelId') channelId: string,
    @Param('threadTs') threadTs: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.slackClient.fetchThreadReplies(channelId, threadTs, {
      limit: limit ? parseInt(limit, 10) : 50,
      cursor: cursor || undefined,
    });
  }
}
