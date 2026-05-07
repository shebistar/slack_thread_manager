import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDb } from '@slack-thread-manager/db';

export const DATABASE_TOKEN = 'DATABASE';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createDb(config.get<string>('DATABASE_URL', '')),
    },
  ],
  exports: [DATABASE_TOKEN],
})
export class DatabaseModule {}
