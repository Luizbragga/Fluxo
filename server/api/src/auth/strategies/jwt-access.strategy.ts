import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'changeme',
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      locationId: payload.locationId ?? null,
      reauthNonce: payload.reauthNonce ?? 0,
      isReauth: payload.isReauth ?? false,
    };
  }
}
