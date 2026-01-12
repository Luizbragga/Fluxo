import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async getMe(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        legalName: true,
        brandName: true,
        slug: true,
        nif: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    return tenant;
  }

  async getSettings(tenantId: string) {
    // garante que sempre exista um settings pro tenant
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    // Remove undefined + protege contra NaN (que quebra Prisma em campos Int)
    const data = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => {
        if (v === undefined) return false;
        if (typeof v === 'number' && Number.isNaN(v)) return false;
        return true;
      }),
    ) as Partial<UpdateTenantSettingsDto>;

    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...data,
      },
      update: {
        ...data,
      },
    });
  }
  async updateMe(
    tenantId: string,
    dto: {
      brandName?: string | null;
      legalName?: string | null;
      nif?: string | null;
    },
  ) {
    const data = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    ) as {
      legalName?: string | null;
      brandName?: string | null;
      nif?: string | null;
    };

    const exists = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!exists) throw new NotFoundException('Tenant não encontrado');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.legalName !== undefined
          ? { legalName: data.legalName ? data.legalName.trim() : null }
          : {}),
        ...(data.brandName !== undefined
          ? { brandName: data.brandName ? data.brandName.trim() : null }
          : {}),
        ...(data.nif !== undefined ? { nif: data.nif } : {}),
      },

      select: {
        id: true,
        legalName: true,
        brandName: true,
        slug: true,
        nif: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
