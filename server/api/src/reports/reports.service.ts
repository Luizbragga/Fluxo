import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderPayoutsQueryDto } from './dto/provider-payouts-query.dto';
import { CustomerPlanPaymentStatus, PayoutStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveDateRange(
    from?: string,
    to?: string,
  ): { fromDate: Date; toDate: Date } {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(
          'Parâmetro "from" inválido. Use uma data ISO 8601.',
        );
      }
      fromDate = d;
    }

    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(
          'Parâmetro "to" inválido. Use uma data ISO 8601.',
        );
      }
      toDate = d;
    }

    // nenhum -> mês atual (UTC)
    if (!fromDate && !toDate) {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();

      fromDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      toDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

      return { fromDate, toDate };
    }

    // só from -> 31 dias pra frente
    if (fromDate && !toDate) {
      toDate = new Date(fromDate.getTime() + 31 * 24 * 60 * 60 * 1000);
    }

    // só to -> 31 dias pra trás
    if (!fromDate && toDate) {
      fromDate = new Date(toDate.getTime() - 31 * 24 * 60 * 60 * 1000);
    }

    if (!fromDate || !toDate) {
      throw new BadRequestException(
        'Não foi possível resolver o intervalo de datas.',
      );
    }

    if (fromDate >= toDate) {
      throw new BadRequestException('"from" deve ser menor que "to".');
    }

    return { fromDate, toDate };
  }
  async getProviderEarnings(params: {
    tenantId: string;
    from?: string;
    to?: string;
    locationId?: string;
  }) {
    const { tenantId, from, to, locationId } = params;
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    const earnings = await this.prisma.appointmentEarning.findMany({
      where: {
        appointment: {
          tenantId,
          status: 'done',
          startAt: {
            gte: fromDate,
            lt: toDate,
          },
          ...(locationId ? { locationId } : {}),
        },
      },
      include: {
        appointment: {
          select: {
            id: true,
            startAt: true,
            providerId: true,
            locationId: true,
            provider: {
              select: { id: true, name: true },
            },
            location: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: {
        appointment: { startAt: 'asc' },
      },
    });

    const totals = {
      servicePriceCents: 0,
      providerEarningsCents: 0,
      houseEarningsCents: 0,
    };

    const byProvider = new Map<
      string,
      {
        providerId: string;
        providerName: string;
        location?: { id: string; name: string } | null;
        servicePriceCents: number;
        providerEarningsCents: number;
        houseEarningsCents: number;
        appointmentsCount: number;
      }
    >();
    for (const e of earnings) {
      totals.servicePriceCents += e.servicePriceCents;
      totals.providerEarningsCents += e.providerEarningsCents;
      totals.houseEarningsCents += e.houseEarningsCents;

      const p = e.appointment.provider;
      const key = p.id;
      let bucket = byProvider.get(key);
      if (!bucket) {
        bucket = {
          providerId: p.id,
          providerName: p.name,
          location: e.appointment.location
            ? {
                id: e.appointment.location.id,
                name: e.appointment.location.name,
              }
            : null,
          servicePriceCents: 0,
          providerEarningsCents: 0,
          houseEarningsCents: 0,
          appointmentsCount: 0,
        };
        byProvider.set(key, bucket);
      }

      bucket.servicePriceCents += e.servicePriceCents;
      bucket.providerEarningsCents += e.providerEarningsCents;
      bucket.houseEarningsCents += e.houseEarningsCents;
      bucket.appointmentsCount += 1; // ← AGORA AQUI, SEMPRE
    }

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totals,
      providers: Array.from(byProvider.values()),
    };
  }
  async getProviderPayouts(tenantId: string, query: ProviderPayoutsQueryDto) {
    const { locationId, providerId, status, from, to } = query;

    const { fromDate, toDate } = this.resolveDateRange(from, to);

    const earnings = await this.prisma.appointmentEarning.findMany({
      where: {
        ...(status ? { payoutStatus: status as PayoutStatus } : {}),
        appointment: {
          tenantId,
          status: 'done', // ✅ só atendimentos concluídos entram no cálculo
          startAt: {
            gte: fromDate,
            lt: toDate,
          },
          ...(locationId ? { locationId } : {}),
          ...(providerId ? { providerId } : {}),
        },
      },
      include: {
        appointment: {
          include: {
            provider: {
              select: { id: true, name: true },
            },
            location: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: {
        appointment: {
          startAt: 'asc',
        },
      },
    });

    let totalServicePriceCents = 0;
    let totalProviderEarningsCents = 0;
    let totalHouseEarningsCents = 0;

    const items = earnings.map((e) => {
      totalServicePriceCents += e.servicePriceCents;
      totalProviderEarningsCents += e.providerEarningsCents;
      totalHouseEarningsCents += e.houseEarningsCents;

      return {
        earningId: e.id,
        appointmentId: e.appointmentId,
        date: e.appointment.startAt,
        serviceName: e.appointment.serviceName,
        servicePriceCents: e.servicePriceCents,
        commissionPercentage: e.commissionPercentage,
        providerEarningsCents: e.providerEarningsCents,
        houseEarningsCents: e.houseEarningsCents,

        provider: e.appointment.provider
          ? {
              id: e.appointment.provider.id,
              name: e.appointment.provider.name,
            }
          : null,
        location: e.appointment.location
          ? {
              id: e.appointment.location.id,
              name: e.appointment.location.name,
            }
          : null,

        payoutStatus: e.payoutStatus,
        payoutAt: e.payoutAt,
        payoutMethod: e.payoutMethod,
        payoutNote: e.payoutNote,
      };
    });

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      filters: {
        locationId: locationId ?? null,
        providerId: providerId ?? null,
        status: status ?? null,
      },
      totals: {
        servicePriceCents: totalServicePriceCents,
        providerEarningsCents: totalProviderEarningsCents,
        houseEarningsCents: totalHouseEarningsCents,
        count: items.length,
      },
      items,
    };
  }
  async markProviderPayoutsAsPaid(params: {
    tenantId: string;
    providerId: string;
  }) {
    const { tenantId, providerId } = params;

    const result = await this.prisma.appointmentEarning.updateMany({
      where: {
        payoutStatus: PayoutStatus.pending,
        appointment: {
          tenantId,
          providerId,
          status: 'done',
        },
      },
      data: {
        payoutStatus: PayoutStatus.paid,
        payoutAt: new Date(),
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  async getPlanPayments(params: {
    tenantId: string;
    from?: string;
    to?: string;
    locationId?: string;
    status?: CustomerPlanPaymentStatus | string;
  }) {
    const { tenantId, from, to, locationId, status } = params;
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    const payments = await this.prisma.customerPlanPayment.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as CustomerPlanPaymentStatus } : {}),
        dueDate: {
          gte: fromDate,
          lt: toDate,
        },
        customerPlan: locationId ? { locationId } : {},
      },
      include: {
        customerPlan: {
          include: {
            planTemplate: true,
            location: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    let totalAmountCents = 0;
    let paidAmountCents = 0;
    let pendingAmountCents = 0;
    let lateAmountCents = 0;

    const items = payments.map((p) => {
      totalAmountCents += p.amountCents;

      if (p.status === 'paid') {
        paidAmountCents += p.amountCents;
      } else if (p.status === 'pending') {
        pendingAmountCents += p.amountCents;
      } else if (p.status === 'late') {
        lateAmountCents += p.amountCents;
      }

      return {
        id: p.id,
        customerName: p.customerPlan.customerName,
        planName: p.customerPlan.planTemplate?.name ?? 'Plano',
        amountCents: p.amountCents,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        location: p.customerPlan.location
          ? {
              id: p.customerPlan.location.id,
              name: p.customerPlan.location.name,
            }
          : null,
      };
    });

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totals: {
        amountCents: totalAmountCents,
        paidAmountCents,
        pendingAmountCents,
        lateAmountCents,
        count: items.length,
      },
      items,
    };
  }
  async getDailyRevenue(params: {
    tenantId: string;
    from?: string;
    to?: string;
    locationId?: string;
  }) {
    const { tenantId, from, to, locationId } = params;
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    const earnings = await this.prisma.appointmentEarning.findMany({
      where: {
        appointment: {
          tenantId,
          status: 'done',
          startAt: {
            gte: fromDate,
            lt: toDate,
          },
          ...(locationId ? { locationId } : {}),
        },
      },
      include: {
        appointment: {
          select: {
            startAt: true,
          },
        },
      },
      orderBy: {
        appointment: {
          startAt: 'asc',
        },
      },
    });

    // agrupar por dia (YYYY-MM-DD em UTC)
    const byDay = new Map<
      string,
      {
        date: Date;
        totalServicePriceCents: number;
      }
    >();

    for (const e of earnings) {
      const d = e.appointment.startAt;
      const dayKey = d.toISOString().slice(0, 10); // yyyy-mm-dd

      let bucket = byDay.get(dayKey);
      if (!bucket) {
        bucket = {
          date: new Date(dayKey + 'T00:00:00.000Z'),
          totalServicePriceCents: 0,
        };
        byDay.set(dayKey, bucket);
      }

      bucket.totalServicePriceCents += e.servicePriceCents;
    }

    const items = Array.from(byDay.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      items: items.map((i) => ({
        date: i.date.toISOString(),
        totalServicePriceCents: i.totalServicePriceCents,
      })),
    };
  }
}
