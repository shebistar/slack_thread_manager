import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Injectable()
export class AuthService {
  getProfile(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
