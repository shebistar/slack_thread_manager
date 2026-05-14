import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { searchRequestSchema } from '@slack-thread-manager/shared';
import type { AuthenticatedUser, SearchRequest } from '@slack-thread-manager/shared';
import { SearchService } from './search.service.js';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequest,
  ) {
    this.logger.debug('Search request received', {
      role: user.role,
      queryLength: body.query.length,
    });

    const result = await this.searchService.search(body.query, user.role);

    return { data: result };
  }
}
