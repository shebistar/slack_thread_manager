import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('admin')
export class AdminController {
  @Get('health')
  @Roles('ADMIN')
  getAdminHealth() {
    return { data: { status: 'admin-ok' } };
  }
}
