import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';

function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' &&
    (Object.values(Role) as string[]).includes(value)
  );
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
    const role = (req.user as { role?: unknown } | undefined)?.role;

    if (!isRole(role)) {
      throw new ForbiddenException('No role in token');
    }

    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException('Forbidden (insufficient role)');
    }

    return true;
  }
}
