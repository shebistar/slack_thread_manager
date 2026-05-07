import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return { data: this.authService.getProfile(user) };
  }
}
