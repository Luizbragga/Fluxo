import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Converte o model do Prisma num "view model" com campos extras
   * que NÃO são salvos no banco (priceLabel, pricePerHour, etc).
   */
  private toViewModel(service: Service) {
    const { durationMin, priceCents, locationId, category, ...rest } = service;

    const priceEuro = priceCents / 100;
    const priceLabel = priceEuro.toFixed(2).replace('.', ','); // ex: "10,00"

    const pricePerHour =
      durationMin > 0
        ? Math.round((priceCents * 60) / durationMin) / 100
        : null;

    return {
      ...rest,
      durationMin,
      priceCents,
      locationId,
      category,
      // extras derivados, só pra leitura:
      priceLabel,
      pricePerHour,
    };
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    // Agora locationId é obrigatório para criar serviço pelo painel
    const { locationId } = dto;

    if (!locationId) {
      throw new BadRequestException(
        'locationId é obrigatório para criar serviços.',
      );
    }

    // garante que a location pertence ao tenant
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });

    if (!location) {
      throw new BadRequestException(
        'locationId inválido ou não pertence a este tenant.',
      );
    }

    const created = await this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name,
        durationMin: dto.durationMin,
        priceCents: dto.priceCents,
        active: dto.active ?? true,
        locationId, // sempre preenchido aqui
        category: dto.category ?? null,
        notes: dto.notes ?? null,
      },
    });

    return this.toViewModel(created);
  }

  /**
   * Lista serviços com paginação simples.
   * Retorna sempre:
   * {
   *   items: ServiceViewModel[],
   *   meta: { page, pageSize, total, totalPages }
   * }
   */
  async findAll(
    tenantId: string,
    params?: { page?: number; pageSize?: number; locationId?: string },
  ) {
    // defaults seguros
    const page = params?.page && params.page > 0 ? params.page : 1;

    const pageSize =
      params?.pageSize && params.pageSize > 0 && params.pageSize <= 100
        ? params.pageSize
        : 20;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {
      tenantId,
      active: true,
    };

    if (params?.locationId) {
      where.locationId = params.locationId;
    }

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.service.count({ where }),
    ]);

    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return {
      items: services.map((s) => this.toViewModel(s)),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });

    if (!service) {
      throw new NotFoundException('Service não encontrado para este tenant');
    }

    return this.toViewModel(service);
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    // garante que o service pertence ao tenant
    const existing = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Service não encontrado para este tenant');
    }

    // se quiser mudar a location, valida também
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { id: true },
      });

      if (!location) {
        throw new BadRequestException(
          'locationId inválido ou não pertence a este tenant.',
        );
      }
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        durationMin: dto.durationMin ?? undefined,
        priceCents: dto.priceCents ?? undefined,
        active: dto.active ?? undefined,
        locationId: dto.locationId ?? undefined,
        category: dto.category ?? undefined,
        notes: dto.notes ?? undefined,
      },
    });

    return this.toViewModel(updated);
  }

  async remove(tenantId: string, id: string) {
    // soft delete dentro do tenant
    const existing = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Service não encontrado para este tenant');
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: { active: false },
    });

    return this.toViewModel(updated);
  }
}
