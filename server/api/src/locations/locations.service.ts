import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateLocationDto) {
    if (!tenantId) {
      throw new BadRequestException('TenantId inválido');
    }

    const baseSlug = dto.slug ? makeSlug(dto.slug) : makeSlug(dto.name);
    if (!baseSlug) {
      throw new BadRequestException(
        'Não foi possível gerar slug para a filial',
      );
    }

    // Garante slug único dentro do tenant
    let slug = baseSlug;
    let n = 1;
    // assumindo que há @@unique([tenantId, slug]) ou slug único
    while (
      await this.prisma.location.findFirst({
        where: { tenantId, slug },
        select: { id: true },
      })
    ) {
      slug = `${baseSlug}-${n++}`;
    }

    const location = await this.prisma.location.create({
      data: {
        tenantId,
        name: dto.name,
        slug,
      },
    });

    return location;
  }

  // src/locations/locations.service.ts

  async findAll(
    tenantId: string,
    params?: { page?: number; pageSize?: number },
  ) {
    // defaults seguros
    const page = params?.page && params.page > 0 ? params.page : 1;

    const pageSize =
      params?.pageSize && params.pageSize > 0 && params.pageSize <= 100
        ? params.pageSize
        : 20;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [items, total] = await Promise.all([
      this.prisma.location.findMany({
        where: {
          tenantId,
          active: true,
        },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.location.count({
        where: {
          tenantId,
          ...(process.env.IGNORE_LOCATION_ACTIVE
            ? {}
            : { active: true as any }),
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
    });
    if (!location) {
      throw new NotFoundException('Location não encontrada neste tenant');
    }
    return location;
  }

  async update(tenantId: string, id: string, dto: UpdateLocationDto) {
    const current = await this.prisma.location.findFirst({
      where: { id, tenantId },
    });
    if (!current) {
      throw new NotFoundException('Location não encontrada neste tenant');
    }

    let slug: string | undefined = undefined;

    if (dto.slug || dto.name) {
      const baseSlug = dto.slug
        ? makeSlug(dto.slug)
        : dto.name
          ? makeSlug(dto.name)
          : current.slug;

      slug = baseSlug;
      if (!baseSlug) {
        throw new BadRequestException(
          'Não foi possível gerar slug para a filial',
        );
      }

      let n = 1;
      while (
        await this.prisma.location.findFirst({
          where: {
            tenantId,
            slug,
            id: { not: id },
          },
          select: { id: true },
        })
      ) {
        slug = `${baseSlug}-${n++}`;
      }
    }

    const updated = await this.prisma.location.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        slug: slug ?? undefined,
      },
    });

    return updated;
  }

  async remove(tenantId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location não encontrada neste tenant');
    }

    // Regra de segurança simples: não remover se tiver providers/appointments pendurados
    const [providersCount, appointmentsCount] = await Promise.all([
      this.prisma.provider.count({ where: { tenantId, locationId: id } }),
      this.prisma.appointment.count({ where: { tenantId, locationId: id } }),
    ]);

    if (providersCount > 0 || appointmentsCount > 0) {
      throw new BadRequestException(
        'Não é possível remover a filial pois existem providers ou appointments associados.',
      );
    }

    await this.prisma.location.delete({ where: { id } });
    return { ok: true };
  }
}
