import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

const DEFAULT_ACCESS_TTL_MIN = 240;
const REFRESH_TTL_SEC = 60 * 60 * 24 * 7; // 7 dias

type AccessPayload = {
  sub: string;
  tenantId: string;
  role: Role;
  locationId?: string | null;
  reauthNonce: number;
  isReauth: boolean;
};

type RefreshPayload = {
  sub: string;
  tenantId: string;
  reauthNonce: number;
};

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ======================
  // Helpers
  // ======================

  private async getAccessTtlSecForTenant(tenantId: string): Promise<number> {
    const settings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
      select: { sessionIdleTimeoutMin: true },
    });

    const raw = settings?.sessionIdleTimeoutMin ?? DEFAULT_ACCESS_TTL_MIN;
    const min = Number.isFinite(raw)
      ? Math.min(1440, Math.max(5, raw))
      : DEFAULT_ACCESS_TTL_MIN;

    return min * 60;
  }

  private signAccess(payload: AccessPayload, ttlSec: number) {
    return this.jwt.sign(
      {
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        locationId: payload.locationId ?? null,
        reauthNonce: payload.reauthNonce ?? 0,
        isReauth: payload.isReauth ?? false,
      },
      {
        secret: process.env.JWT_SECRET || 'changeme',
        expiresIn: ttlSec,
      },
    );
  }

  private signRefresh(payload: RefreshPayload) {
    return this.jwt.sign(
      {
        sub: payload.sub,
        tenantId: payload.tenantId,
        reauthNonce: payload.reauthNonce ?? 0,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'changeme',
        expiresIn: REFRESH_TTL_SEC,
      },
    );
  }

  private async saveRefresh(userId: string, refresh: string) {
    const decoded = this.jwt.decode(refresh) as { exp?: number } | null;
    const expSec =
      decoded?.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;

    const expiresAt = new Date(expSec * 1000);
    const tokenHash = await bcrypt.hash(refresh, 10);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  private async generateUniqueTenantSlug(baseName: string): Promise<string> {
    let base = makeSlug(baseName);
    if (!base) base = `tenant-${Date.now()}`;

    let slug = base;
    let n = 1;

    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }

    return slug;
  }

  // ======================
  // Register
  // ======================

  async registerTenant(dto: RegisterTenantDto) {
    const role = dto.ownerRole ?? Role.owner;

    const exists = await this.prisma.user.findFirst({
      where: { email: dto.ownerEmail },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Email já cadastrado em algum tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const slug = await this.generateUniqueTenantSlug(dto.tenantName);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          brandName: dto.tenantName,
          legalName: dto.tenantName,
          slug,
          nif: dto.tenantNif ?? null,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          role,
          name: dto.ownerName,
          email: dto.ownerEmail,
          phone: dto.ownerPhone ?? null,
          passwordHash,
          active: true,
        },
        select: {
          id: true,
          tenantId: true,
          role: true,
          locationId: true,
          reauthNonce: true,
        },
      });

      return { tenant, user };
    });

    const ttlSec = await this.getAccessTtlSecForTenant(user.tenantId);

    const access = this.signAccess(
      {
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
        locationId: user.locationId ?? null,
        reauthNonce: user.reauthNonce ?? 0,
        isReauth: false,
      },
      ttlSec,
    );

    const refresh = this.signRefresh({
      sub: user.id,
      tenantId: tenant.id,
      reauthNonce: user.reauthNonce ?? 0,
    });

    await this.saveRefresh(user.id, refresh);

    return {
      tenant: {
        id: tenant.id,
        brandName: tenant.brandName,
        legalName: tenant.legalName,
        slug: tenant.slug,
      },

      user: { id: user.id, role: user.role },
      tokens: { access, refresh },
    };
  }

  // ======================
  // Login
  // ======================

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, active: true },
      select: {
        id: true,
        tenantId: true,
        role: true,
        locationId: true,
        passwordHash: true,
        reauthNonce: true,
      },
    });

    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const ttlSec = await this.getAccessTtlSecForTenant(user.tenantId);

    const access = this.signAccess(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        locationId: user.locationId ?? null,
        reauthNonce: user.reauthNonce ?? 0,
        isReauth: false, // ✅ login não conta como reauth
      },
      ttlSec,
    );

    const refresh = this.signRefresh({
      sub: user.id,
      tenantId: user.tenantId,
      reauthNonce: user.reauthNonce ?? 0,
    });

    await this.saveRefresh(user.id, refresh);

    return {
      user: { id: user.id, tenantId: user.tenantId, role: user.role },
      tokens: { access, refresh },
    };
  }

  // ======================
  // Refresh (rotation)
  // ======================

  async refreshFromToken(refreshToken: string) {
    let decoded: any;

    try {
      decoded = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'changeme',
      });
    } catch {
      throw new UnauthorizedException('Refresh inválido');
    }

    const userId = decoded?.sub as string | undefined;
    const tenantId = decoded?.tenantId as string | undefined;

    if (!userId || !tenantId)
      throw new UnauthorizedException('Refresh inválido');

    // valida se este refresh existe no banco (hash + expiração)
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId },
      select: { id: true, tokenHash: true, expiresAt: true },
    });

    let usedRowId: string | null = null;

    for (const r of rows) {
      const ok = await bcrypt.compare(refreshToken, r.tokenHash);
      if (ok && r.expiresAt > new Date()) {
        usedRowId = r.id;
        break;
      }
    }

    if (!usedRowId) throw new UnauthorizedException('Refresh inválido');

    // pega usuário (e o nonce atual do banco)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        locationId: true,
        reauthNonce: true,
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const ttlSec = await this.getAccessTtlSecForTenant(user.tenantId);

    const access = this.signAccess(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        locationId: user.locationId ?? null,
        reauthNonce: user.reauthNonce ?? 0,
        isReauth: false, // ✅ refresh não conta como reauth
      },
      ttlSec,
    );

    const newRefresh = this.signRefresh({
      sub: user.id,
      tenantId: user.tenantId,
      reauthNonce: user.reauthNonce ?? 0,
    });

    // rotação: apaga o refresh usado e grava o novo
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: usedRowId! } });

      const decodedNew = this.jwt.decode(newRefresh) as { exp?: number } | null;
      const expSec =
        decodedNew?.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;

      const expiresAt = new Date(expSec * 1000);
      const tokenHash = await bcrypt.hash(newRefresh, 10);

      await tx.refreshToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    return { tokens: { access, refresh: newRefresh } };
  }

  // ======================
  // Logout
  // ======================

  async revokeRefresh(refreshToken: string) {
    const decoded = this.jwt.decode(refreshToken) as { sub?: string } | null;
    if (!decoded?.sub) return;

    const rows = await this.prisma.refreshToken.findMany({
      where: { userId: decoded.sub },
      select: { id: true, tokenHash: true },
    });

    for (const r of rows) {
      const ok = await bcrypt.compare(refreshToken, r.tokenHash);
      if (ok) {
        await this.prisma.refreshToken.delete({ where: { id: r.id } });
        break;
      }
    }
  }

  // ======================
  // REAUTH (confirmar senha)
  // ======================

  async reauth(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        locationId: true,
        passwordHash: true,
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Senha inválida');

    // ✅ incrementa nonce (este token reauth será “um evento novo”)
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { reauthNonce: { increment: 1 } },
      select: { reauthNonce: true },
    });

    const ttlSec = await this.getAccessTtlSecForTenant(user.tenantId);

    const access = this.signAccess(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        locationId: user.locationId ?? null,
        reauthNonce: updated.reauthNonce,
        isReauth: true, // ✅ este token passa no guard
      },
      ttlSec,
    );

    const refresh = this.signRefresh({
      sub: user.id,
      tenantId: user.tenantId,
      reauthNonce: updated.reauthNonce,
    });

    // política: revoga todos os refresh e grava só o novo
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });

      const tokenHash = await bcrypt.hash(refresh, 10);
      const decodedNew = this.jwt.decode(refresh) as { exp?: number } | null;
      const expSec =
        decodedNew?.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;

      const expiresAt = new Date(expSec * 1000);

      await tx.refreshToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    return { tokens: { access, refresh } };
  }
}
