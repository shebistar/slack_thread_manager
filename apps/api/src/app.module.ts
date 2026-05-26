import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { SlackModule } from './modules/slack/slack.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { PipelineModule } from './modules/pipeline/pipeline.module.js';
import { BriefingsModule } from './modules/briefings/briefings.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { SilenceModule } from './modules/silence/silence.module.js';
import { EnrichmentModule } from './modules/enrichment/enrichment.module.js';
import { DatabaseModule } from './database/database.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { envSchema } from './config/app.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminModule,
    SlackModule,
    IngestionModule,
    PipelineModule,
    BriefingsModule,
    SearchModule,
    SilenceModule,
    EnrichmentModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
