import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
