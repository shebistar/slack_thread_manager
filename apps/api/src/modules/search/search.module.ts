import { Module } from '@nestjs/common';
import { FtsService } from './fts.service.js';

@Module({
  providers: [FtsService],
  exports: [FtsService],
})
export class SearchModule {}
