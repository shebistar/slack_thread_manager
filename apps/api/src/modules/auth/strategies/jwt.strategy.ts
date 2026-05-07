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

  validate(payload: Record<string, unknown>): AuthenticatedUser {
    const realmRoles = (payload.realm_access as { roles?: string[] })?.roles ?? [];
    const role = (payload.role as string | undefined) ?? realmRoles[0] ?? 'CONSULTANT';

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name ?? payload.preferred_username) as string,
      role: role as AuthenticatedUser['role'],
    };
  }
}
