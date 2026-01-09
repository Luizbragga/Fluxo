import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { SENSITIVE_KEY } from '../decorators/sensitive.decorator';

@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isSensitive = this.reflector.getAllAndOverride<boolean>(
      SENSITIVE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!isSensitive) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as
      | {
          id?: string;
          tenantId?: string;
          isReauth?: boolean;
          reauthNonce?: number;
        }
      | undefined;

    const tenantId = user?.tenantId;
    const userId = user?.id;

    if (!tenantId || !userId) return true;

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { requireReauthForSensitiveActions: true },
    });

    if (!settings?.requireReauthForSensitiveActions) return true;

    // ✅ login NÃO conta: só token vindo do /auth/reauth tem isReauth=true
    if (!user?.isReauth) {
      throw new ForbiddenException({
        code: 'REAUTH_REQUIRED',
        message: 'Reautenticação necessária para esta ação.',
      });
    }

    const tokenNonce = Number(user?.reauthNonce ?? 0);

    // ✅ One-time: só libera se o nonce do token bate com o do banco
    // e já consome (incrementa) na mesma tacada pra não reutilizar.
    const consumed = await this.prisma.user.updateMany({
      where: { id: userId, tenantId, reauthNonce: tokenNonce },
      data: { reauthNonce: { increment: 1 } },
    });

    if (consumed.count === 0) {
      throw new ForbiddenException({
        code: 'REAUTH_REQUIRED',
        message: 'Reautenticação necessária para esta ação.',
      });
    }

    return true;
  }
}
