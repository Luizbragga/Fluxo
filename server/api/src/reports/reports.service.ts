import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderPayoutsQueryDto } from './dto/provider-payouts-query.dto';
import {
  AppointmentState,
  CustomerPlanPaymentStatus,
  PayoutStatus,
} from '@prisma/client';

// Tamanho de slot para cálculo de ocupação (15 min)
const OCCUPATION_SLOT_MIN = 15;

/** Converte 'HH:mm' para minutos desde 00:00 */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Subtrai uma lista de blocos (em minutos) de uma lista de intervalos (em minutos) */
function subtractBlocks(
  intervals: { start: number; end: number }[],
  blocks: { start: number; end: number }[],
): { start: number; end: number }[] {
  let result = [...intervals];

  for (const b of blocks) {
    const next: { start: number; end: number }[] = [];

    for (const it of result) {
      // sem interseção: mantém
      if (b.end <= it.start || b.start >= it.end) {
        next.push(it);
        continue;
      }

      // há interseção: recorta em até duas partes
      if (b.start > it.start) {
        next.push({
          start: it.start,
          end: Math.max(it.start, Math.min(b.start, it.end)),
        });
      }

      if (b.end < it.end) {
        next.push({
          start: Math.min(Math.max(b.end, it.start), it.end),
          end: it.end,
        });
      }
    }

    result = next;
  }

  // remove fragmentos vazios/invertidos
  return result.filter((r) => r.end - r.start > 0);
}

/** Mescla ranges sobrepostos/colados (em minutos) */
function mergeRanges(ranges: { start: number; end: number }[]) {
  if (ranges.length === 0) return [];
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [ordered[0]];

  for (let i = 1; i < ordered.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ordered[i];

    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  return merged;
}

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

  async getCancellationsAndNoShows(params: {
    tenantId: string;
    from?: string;
    to?: string;
    locationId?: string;
    providerId?: string;
    type?: 'cancelled' | 'no_show';
  }) {
    const { tenantId, from, to, locationId, providerId, type } = params;
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    // Filtro de status usando o enum CORRETO do Prisma: AppointmentState
    const statusFilter:
      | { equals: AppointmentState }
      | { in: AppointmentState[] } =
      type === 'cancelled'
        ? { equals: AppointmentState.cancelled }
        : type === 'no_show'
          ? { equals: AppointmentState.no_show }
          : {
              in: [AppointmentState.cancelled, AppointmentState.no_show],
            };

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: statusFilter,
        startAt: {
          gte: fromDate,
          lt: toDate,
        },
        ...(locationId ? { locationId } : {}),
        ...(providerId ? { providerId } : {}),
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        clientName: true,
        serviceName: true,
        provider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startAt: 'desc',
      },
    });

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      items: appointments.map((a) => ({
        id: a.id,
        date: a.startAt,
        status: a.status,
        customerName: a.clientName,
        professionalName: a.provider?.name ?? null,
        serviceName: a.serviceName,
        // por enquanto sem motivo detalhado
        reason: null,
      })),
    };
  }

  async getProviderEarnings(params: {
    tenantId: string;
    from?: string;
    to?: string;
    locationId?: string;
  }) {
    const { tenantId, from, to, locationId } = params;
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    // 1) Earnings (apenas atendimentos concluídos)
    const earnings = await this.prisma.appointmentEarning.findMany({
      where: {
        appointment: {
          tenantId,
          status: AppointmentState.done,
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
            endAt: true, // <--- precisamos para calcular duração
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

    type ProviderBucket = {
      providerId: string;
      providerName: string;
      location?: { id: string; name: string } | null;
      servicePriceCents: number;
      providerEarningsCents: number;
      houseEarningsCents: number;
      appointmentsCount: number;
      workedMinutes: number;
      availableMinutes: number;
      totalSlots: number;
      usedSlots: number;
      occupationPercentage: number;
    };

    const byProvider = new Map<string, ProviderBucket>();

    // 2) Agrega por provider + calcula minutos trabalhados (em slots de 15 min)
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
          workedMinutes: 0,
          availableMinutes: 0,
          totalSlots: 0,
          usedSlots: 0,
          occupationPercentage: 0,
        };
        byProvider.set(key, bucket);
      }

      bucket.servicePriceCents += e.servicePriceCents;
      bucket.providerEarningsCents += e.providerEarningsCents;
      bucket.houseEarningsCents += e.houseEarningsCents;
      bucket.appointmentsCount += 1;

      // duração do atendimento em minutos
      const start = e.appointment.startAt;
      const end = e.appointment.endAt;

      if (end && start) {
        const diffMs = end.getTime() - start.getTime();
        const rawMinutes = Math.max(0, diffMs / 60000);

        // converte para slots de 15min, sempre arredondando para cima
        const slots = Math.ceil(rawMinutes / OCCUPATION_SLOT_MIN);
        const workedMinutes = slots * OCCUPATION_SLOT_MIN;

        bucket.workedMinutes += workedMinutes;
      }
    }

    // Se não há nenhum earning, devolve só os totais (zerados) como antes
    if (byProvider.size === 0) {
      return {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        totals,
        providers: [] as ProviderBucket[],
      };
    }

    // 3) Carrega weekdayTemplate dos providers envolvidos + blocks no período
    const providerIds = Array.from(byProvider.keys());

    const [providersMeta, blocks] = await Promise.all([
      this.prisma.provider.findMany({
        where: {
          tenantId,
          id: { in: providerIds },
        },
        select: {
          id: true,
          weekdayTemplate: true,
        },
      }),
      this.prisma.block.findMany({
        where: {
          tenantId,
          providerId: { in: providerIds },
          startAt: { lt: toDate },
          endAt: { gt: fromDate },
        },
        select: {
          providerId: true,
          startAt: true,
          endAt: true,
        },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const blocksByProvider = new Map<
      string,
      { startAt: Date; endAt: Date }[]
    >();

    for (const b of blocks) {
      const arr = blocksByProvider.get(b.providerId) ?? [];
      arr.push({ startAt: b.startAt, endAt: b.endAt });
      blocksByProvider.set(b.providerId, arr);
    }

    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    // Normaliza from/to para início do dia UTC
    const rangeStart = new Date(
      Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const rangeEndExclusive = new Date(
      Date.UTC(
        toDate.getUTCFullYear(),
        toDate.getUTCMonth(),
        toDate.getUTCDate(),
        0,
        0,
        0,
      ),
    );

    // 4) Para cada provider, calcula minutos "disponíveis" no período,
    for (const meta of providersMeta) {
      const bucket = byProvider.get(meta.id);
      if (!bucket) continue;

      const template =
        (meta.weekdayTemplate as Record<string, [string, string][]> | null) ??
        {};

      const providerBlocks = blocksByProvider.get(meta.id) ?? [];

      let availableMinutes = 0;

      let cursor = new Date(rangeStart.getTime());
      while (cursor < rangeEndExclusive) {
        const dayStart = cursor;
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        const weekdayKey = keyMap[dayStart.getUTCDay()];
        const rawIntervals = template[weekdayKey] ?? [];

        if (rawIntervals.length === 0) {
          cursor = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          continue;
        }

        const dayIntervals = rawIntervals
          .map(([start, end]) => {
            const s = toMin(start);
            const e = toMin(end);
            return {
              start: Math.max(0, s),
              end: Math.min(24 * 60, e),
            };
          })
          .filter((r) => r.end > r.start);

        if (dayIntervals.length === 0) {
          cursor = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          continue;
        }

        const dayBlockRanges = providerBlocks
          .filter((b) => b.startAt < dayEnd && b.endAt > dayStart)
          .map((b) => {
            const s = Math.max(
              0,
              Math.floor((b.startAt.getTime() - dayStart.getTime()) / 60000),
            );
            const e = Math.min(
              24 * 60,
              Math.ceil((b.endAt.getTime() - dayStart.getTime()) / 60000),
            );
            return { start: s, end: e };
          })
          .filter((r) => r.end > r.start);

        const mergedBlocks = mergeRanges(dayBlockRanges);
        const free = subtractBlocks(dayIntervals, mergedBlocks);

        for (const r of free) {
          availableMinutes += r.end - r.start;
        }

        cursor = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      }

      // ---- AQUI entra a lógica de SLOTS ----
      const totalSlots = Math.floor(availableMinutes / OCCUPATION_SLOT_MIN);
      const usedSlots = Math.floor(bucket.workedMinutes / OCCUPATION_SLOT_MIN);

      let occupationPercentage = 0;
      if (totalSlots > 0) {
        const raw = (usedSlots / totalSlots) * 100;
        // 1 casa decimal (ex: 1.2%)
        occupationPercentage = Math.round(raw * 10) / 10;
      }

      bucket.availableMinutes = availableMinutes;
      bucket.totalSlots = totalSlots;
      bucket.usedSlots = usedSlots;
      bucket.occupationPercentage = occupationPercentage;
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
          status: AppointmentState.done,
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
          status: AppointmentState.done,
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
          status: AppointmentState.done,
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
