import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtAccessPayload = {
  sub: string;
  tenantId: string;
  role: string;
  locationId?: string | null;
  reauthNonce?: number;
  isReauth?: boolean;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'changeme',
    });
  }

  validate(payload: JwtAccessPayload) {
    const userId = payload.sub;

    return {
      id: userId,
      userId,
      tenantId: payload.tenantId,
      role: payload.role,
      locationId: payload.locationId ?? null,
      reauthNonce: payload.reauthNonce ?? 0,
      isReauth: payload.isReauth ?? false,
    };
  }
}
