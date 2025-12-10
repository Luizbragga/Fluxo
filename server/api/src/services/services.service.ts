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
  /**
   * Lista serviços com paginação simples.
   * Se vier customerPlanId, filtra apenas os serviços permitidos pelo plano.
   */
  async findAll(
    tenantId: string,
    params?: {
      page?: number;
      pageSize?: number;
      locationId?: string;
      customerPlanId?: string;
    },
  ) {
    // defaults seguros
    const page = params?.page && params.page > 0 ? params.page : 1;

    const pageSize =
      params?.pageSize && params.pageSize > 0 && params.pageSize <= 100
        ? params.pageSize
        : 20;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // -------------------------------
    // Estatísticas do mês atual
    // -------------------------------
    const now = new Date();

    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
    );

    const statsWhere: any = {
      tenantId,
      status: 'done',
      startAt: {
        gte: monthStart,
        lt: monthEnd,
      },
    };

    if (params?.locationId) {
      statsWhere.locationId = params.locationId;
    }

    // Agrupa por serviço (nome + locationId) no mês atual
    const statsGrouped = await this.prisma.appointment.groupBy({
      by: ['serviceName', 'locationId'],
      where: statsWhere,
      _count: { _all: true },
      _sum: { servicePriceCents: true },
    });

    // Mapa: "serviceName::locationId" -> { uses, revenue }
    const serviceStatsMap = new Map<
      string,
      { usesThisMonth: number; revenueThisMonth: number }
    >();

    for (const row of statsGrouped) {
      const key = `${row.serviceName ?? ''}::${row.locationId ?? 'none'}`;

      const uses = row._count._all;
      const revenueCents = row._sum.servicePriceCents ?? 0;
      const revenueEuros = revenueCents / 100;

      serviceStatsMap.set(key, {
        usesThisMonth: uses,
        revenueThisMonth: revenueEuros,
      });
    }

    // Helper para anexar estatísticas a cada serviço
    const attachStats = (service: Service) => {
      const key = `${service.name ?? ''}::${service.locationId ?? 'none'}`;
      const stats = serviceStatsMap.get(key);

      const base = this.toViewModel(service);

      return {
        ...base,
        usesThisMonth: stats?.usesThisMonth ?? 0,
        revenueThisMonth: stats?.revenueThisMonth ?? 0,
      };
    };

    // ------------------------------------------------------------
    // CASO 1: veio customerPlanId -> pegar serviços do plano
    // ------------------------------------------------------------
    if (params?.customerPlanId) {
      const customerPlan = await this.prisma.customerPlan.findFirst({
        where: {
          id: params.customerPlanId,
          tenantId,
        },
        include: {
          planTemplate: {
            select: {
              sameDayServiceIds: true,
            },
          },
        },
      });

      if (!customerPlan || !customerPlan.planTemplate) {
        throw new BadRequestException(
          'Plano do cliente não encontrado para este tenant.',
        );
      }

      const serviceIds = customerPlan.planTemplate
        .sameDayServiceIds as string[];

      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        // plano sem serviços associados -> devolve vazio pra ficar claro
        return {
          items: [],
          meta: {
            page: 1,
            pageSize,
            total: 0,
            totalPages: 1,
          },
        };
      }

      const where: any = {
        tenantId,
        active: true,
        id: { in: serviceIds },
      };

      if (params.locationId) {
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
        items: services.map((s) => attachStats(s)),
        meta: {
          page,
          pageSize,
          total,
          totalPages,
        },
      };
    }

    // ------------------------------------------------------------
    // CASO 2: sem customerPlanId -> lista normal do tenant
    // ------------------------------------------------------------
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
      items: services.map((s) => attachStats(s)),
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
