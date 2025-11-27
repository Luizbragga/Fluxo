import { Injectable, NotFoundException } from '@nestjs/common';
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
    const { durationMin, priceCents, ...rest } = service;

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
      // extras derivados, só pra leitura:
      priceLabel,
      pricePerHour,
    };
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    const created = await this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name,
        durationMin: dto.durationMin,
        priceCents: dto.priceCents,
        active: dto.active ?? true,
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

    const where = {
      tenantId,
      active: true,
    };

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

    const updated = await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        durationMin: dto.durationMin ?? undefined,
        priceCents: dto.priceCents ?? undefined,
        active: dto.active ?? undefined,
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
