import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

describe('AuthController', () => {
  let controller: AuthController;

  const mockUser: AuthenticatedUser = {
    sub: 'user-123',
    email: 'shebi@example.com',
    name: 'Shebi',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [AuthService],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('GET /auth/me', () => {
    it('returns the authenticated user wrapped in { data }', () => {
      const result = controller.getMe(mockUser);

      expect(result).toEqual({ data: mockUser });
    });

    it('returns the exact user passed by the decorator', () => {
      const pmUser: AuthenticatedUser = {
        sub: 'user-456',
        email: 'priya@example.com',
        name: 'Priya Sharma',
        role: 'PM',
      };

      const result = controller.getMe(pmUser);

      expect(result.data.role).toBe('PM');
      expect(result.data.email).toBe('priya@example.com');
    });
  });
});
