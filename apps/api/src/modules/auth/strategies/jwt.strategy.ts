import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { AuthenticatedUser } from '@slack-thread-manager/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const realmUrl = configService.getOrThrow<string>('KEYCLOAK_REALM_URL');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${realmUrl}/protocol/openid-connect/certs`,
      }),
      issuer: realmUrl,
      algorithms: ['RS256'],
    });
  }

  private static readonly APP_ROLES: ReadonlySet<string> = new Set([
    'ARCHITECT',
    'PM',
    'CONSULTANT',
    'SALES',
    'TRAINING',
    'ADMIN',
  ]);

  validate(payload: Record<string, unknown>): AuthenticatedUser {
    const realmRoles =
      (payload.realm_access as { roles?: string[] })?.roles ?? [];
    const appRole =
      (payload.role as string | undefined) ??
      realmRoles.find((r) => JwtStrategy.APP_ROLES.has(r)) ??
      'CONSULTANT';

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name ?? payload.preferred_username) as string,
      role: appRole as AuthenticatedUser['role'],
    };
  }
}
