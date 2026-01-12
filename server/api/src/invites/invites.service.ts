import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { Role, Specialty } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  private hashToken(rawToken: string) {
    const secret =
      process.env.INVITE_TOKEN_SECRET || process.env.JWT_SECRET || 'changeme';
    return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
  }

  private makeRawToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  async createInvite(params: {
    tenantId: string;
    createdById: string;
    dto: CreateInviteDto;
  }) {
    const { tenantId, createdById, dto } = params;

    if (dto.role === Role.provider && !dto.specialty) {
      throw new BadRequestException(
        'Para role=provider, specialty é obrigatório.',
      );
    }

    if (dto.locationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { id: true },
      });
      if (!loc)
        throw new BadRequestException('locationId inválido para este tenant.');
    }

    const rawToken = this.makeRawToken();
    const tokenHash = this.hashToken(rawToken);

    const hours = dto.expiresInHours ?? 72;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const invite = await this.prisma.invite.create({
      data: {
        tenantId,
        role: dto.role,
        specialty: dto.specialty ?? null,
        locationId: dto.locationId ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        tokenHash,
        expiresAt,
        createdById,
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
        specialty: true,
        locationId: true,
        email: true,
        phone: true,
        expiresAt: true,
        createdAt: true,
        acceptedAt: true,
      },
    });

    const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${webBase}/convite?token=${rawToken}`;

    return { invite, inviteUrl };
  }

  // ======================
  // VALIDATE (público)
  // ======================
  async validateInvite(rawToken: string) {
    if (!rawToken) throw new BadRequestException('Token inválido');

    const tokenHash = this.hashToken(rawToken);

    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash },
      include: {
        tenant: { select: { id: true, brandName: true, slug: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!invite) throw new UnauthorizedException('Convite inválido');
    if (invite.acceptedAt)
      throw new BadRequestException('Convite já foi utilizado');
    if (invite.expiresAt <= new Date())
      throw new BadRequestException('Convite expirado');

    return {
      tenant: invite.tenant,
      invite: {
        role: invite.role,
        specialty: invite.specialty,
        locationId: invite.locationId,
        locationName: invite.location?.name ?? null,
        email: invite.email,
        phone: invite.phone,
        expiresAt: invite.expiresAt,
      },
    };
  }

  // ======================
  // ACCEPT (público)
  // ======================
  async acceptInvite(dto: AcceptInviteDto) {
    const tokenHash = this.hashToken(dto.token);

    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash },
      include: {
        location: {
          select: { id: true, tenantId: true, businessHoursTemplate: true },
        },
      },
    });

    if (!invite) throw new UnauthorizedException('Convite inválido');
    if (invite.acceptedAt)
      throw new BadRequestException('Convite já foi utilizado');
    if (invite.expiresAt <= new Date())
      throw new BadRequestException('Convite expirado');

    const email = (dto.email ?? invite.email ?? '').trim();
    if (!email)
      throw new BadRequestException(
        'Email é obrigatório para aceitar o convite.',
      );

    // User.email é @unique global -> tem que checar global
    const emailExists = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailExists) {
      throw new BadRequestException('Já existe um utilizador com este email.');
    }

    // resolve location
    const resolvedLocationId = invite.locationId ?? dto.locationId ?? null;

    if (invite.role === Role.provider) {
      if (!invite.specialty) {
        throw new BadRequestException(
          'Convite de provider sem specialty (inválido).',
        );
      }
      if (!resolvedLocationId) {
        throw new BadRequestException(
          'Convite de provider precisa de locationId.',
        );
      }
    }

    // se veio locationId, valida pertença ao tenant
    if (resolvedLocationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: resolvedLocationId, tenantId: invite.tenantId },
        select: { id: true, businessHoursTemplate: true },
      });
      if (!loc)
        throw new BadRequestException('locationId inválido para este tenant.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // cria user + provider (se necessário) e marca invite como usado
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });

      if (updated.count !== 1) {
        throw new BadRequestException('Convite já foi utilizado.');
      }

      const user = await tx.user.create({
        data: {
          tenantId: invite.tenantId,
          locationId: resolvedLocationId,
          role: invite.role,
          name: dto.name,
          email,
          phone: dto.phone ?? invite.phone ?? null,
          passwordHash,
          active: true,
        },
        select: { id: true },
      });

      if (invite.role === Role.provider) {
        const loc = await tx.location.findFirst({
          where: { id: resolvedLocationId!, tenantId: invite.tenantId },
          select: { businessHoursTemplate: true },
        });

        await tx.provider.create({
          data: {
            tenantId: invite.tenantId,
            userId: user.id,
            locationId: resolvedLocationId!,
            name: dto.name,
            specialty: (invite.specialty ?? Specialty.other) as Specialty,
            weekdayTemplate: (loc?.businessHoursTemplate as any) ?? undefined,
            active: true,
          },
        });
      }
    });

    // devolve tokens como se fosse login
    return this.auth.login({ email, password: dto.password });
  }
}
