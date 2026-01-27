import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, AppointmentState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

type PublicRange = {
  id: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status:
    | 'scheduled'
    | 'in_service'
    | 'done'
    | 'no_show'
    | 'cancelled'
    | 'blocked';
};

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------
  // LEGADO - por locationId (id)
  // -----------------------------
  async getPublicBookingData(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        name: true,
        bookingIntervalMin: true,
        businessHoursTemplate: true,
        tenantId: true,
        slug: true,
        active: true,
      },
    });

    if (!location || !location.active) {
      throw new NotFoundException('Location não encontrada.');
    }

    const [services, providers] = await Promise.all([
      this.prisma.service.findMany({
        where: {
          locationId,
          active: true,
        },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
        },
        orderBy: { name: 'asc' },
      }),

      this.prisma.provider.findMany({
        where: {
          locationId,
          active: true,
        },
        select: {
          id: true,
          name: true,
          user: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      location,
      services,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name ?? p.user?.name ?? 'Profissional',
      })),
    };
  }

  async createPublicAppointment(
    locationId: string,
    dto: CreatePublicAppointmentDto,
  ) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        tenantId: true,
        bookingIntervalMin: true,
        businessHoursTemplate: true,
        active: true,
      },
    });

    if (!location || !location.active) {
      throw new NotFoundException('Location não encontrada.');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, locationId: location.id, active: true },
      select: { id: true, durationMin: true, name: true, priceCents: true },
    });

    if (!service) {
      throw new BadRequestException('Serviço inválido para esta location.');
    }

    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, locationId: location.id, active: true },
      select: { id: true, tenantId: true },
    });

    if (!provider) {
      throw new BadRequestException(
        'Profissional inválido para esta location.',
      );
    }

    const startAt = buildLocalDateTime(dto.date, dto.time);
    if (!isFiniteDate(startAt)) {
      throw new BadRequestException('Data/hora inválidas.');
    }

    // não permite passado (com 1min de tolerância)
    if (startAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException(
        'Não é possível agendar em horário passado.',
      );
    }

    const durationMin = Number(service.durationMin);
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      throw new BadRequestException('Serviço com duração inválida.');
    }

    const endAt = new Date(startAt.getTime() + durationMin * 60_000);

    // expediente (Location.businessHoursTemplate)
    const tpl = (location.businessHoursTemplate ?? {}) as Record<
      string,
      [string, string][]
    >;

    if (!isWithinBusinessHours(startAt, endAt, tpl)) {
      throw new BadRequestException('Horário fora do expediente.');
    }

    // conflito com BLOCKS (public)
    const blockConflict = await this.prisma.block.findFirst({
      where: {
        tenantId: location.tenantId,
        providerId: provider.id,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (blockConflict) {
      throw new BadRequestException('Este horário não está disponível.');
    }

    // conflito com appointments (overlap) — considera qualquer coisa que não esteja cancelled
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        locationId: location.id,
        providerId: provider.id,
        status: { not: 'cancelled' },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (conflict) {
      throw new BadRequestException(
        'Este horário acabou de ser reservado. Escolha outro.',
      );
    }

    // Customer por (tenantId, phone)
    let customerId: string | undefined;
    const phone = dto.customerPhone.trim();
    const name = dto.customerName.trim();

    if (!phone || !name) {
      throw new BadRequestException(
        'Nome e telefone do cliente são obrigatórios.',
      );
    }

    const existingCustomer = await this.prisma.customer.findUnique({
      where: { tenant_phone_unique: { tenantId: location.tenantId, phone } },
      select: { id: true },
    });

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
    } else {
      const createdCustomer = await this.prisma.customer.create({
        data: {
          tenantId: location.tenantId,
          name,
          phone,
        },
        select: { id: true },
      });
      customerId = createdCustomer.id;
    }

    const data: Prisma.AppointmentUncheckedCreateInput = {
      tenantId: location.tenantId,
      locationId: location.id,
      providerId: provider.id,
      serviceId: service.id,

      // snapshots
      serviceName: service.name,
      serviceDurationMin: service.durationMin,
      servicePriceCents: service.priceCents,

      startAt,
      endAt,

      // schema usa clientName/clientPhone
      clientName: name,
      clientPhone: phone,

      status: AppointmentState.scheduled,
      customerId,
    };

    const created = await this.prisma.appointment.create({
      data,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
      },
    });

    return { ok: true, appointment: created };
  }

  // -----------------------------
  // NOVO - por slug (tenant/location)
  // -----------------------------
  private async resolveLocationBySlug(
    tenantSlug: string,
    locationSlug: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    const location = await this.prisma.location.findFirst({
      where: {
        tenantId: tenant.id,
        slug: locationSlug,
        active: true,
      },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException('Location não encontrada.');
    }

    return location.id;
  }

  async getPublicBookingDataBySlug(tenantSlug: string, locationSlug: string) {
    const locationId = await this.resolveLocationBySlug(
      tenantSlug,
      locationSlug,
    );
    return this.getPublicBookingData(locationId);
  }

  async createPublicAppointmentBySlug(
    tenantSlug: string,
    locationSlug: string,
    dto: CreatePublicAppointmentDto,
  ) {
    const locationId = await this.resolveLocationBySlug(
      tenantSlug,
      locationSlug,
    );
    return this.createPublicAppointment(locationId, dto);
  }

  // -----------------------------
  // DISPONIBILIDADE DO DIA (public)
  // appointments + blocks
  // -----------------------------
  async getPublicDayAppointments(params: {
    locationId: string;
    providerId: string;
    date: string; // YYYY-MM-DD
  }): Promise<PublicRange[]> {
    const { locationId, providerId, date } = params;

    if (!locationId || !providerId || !date) {
      throw new BadRequestException(
        'locationId, providerId e date são obrigatórios.',
      );
    }

    const { start, end } = dayUtcRange(date);

    // pega tenantId da location (pra filtrar blocks corretamente)
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { tenantId: true, active: true },
    });

    if (!location || !location.active) {
      throw new NotFoundException('Location não encontrada.');
    }

    // appointments do dia
    const appts = await this.prisma.appointment.findMany({
      where: {
        locationId,
        providerId,
        startAt: { gte: start },
        endAt: { lte: end },
      },
      select: { id: true, startAt: true, endAt: true, status: true },
      orderBy: { startAt: 'asc' },
    });

    // blocks do dia
    const blocks = await this.prisma.block.findMany({
      where: {
        tenantId: location.tenantId,
        providerId,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      select: { id: true, startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    // normaliza em uma lista única (front só precisa de ranges ocupados)
    const out: PublicRange[] = [
      ...appts.map((a) => ({
        id: a.id,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
        status: (a.status as any) ?? 'scheduled',
      })),
      ...blocks.map((b) => ({
        id: `block_${b.id}`,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        status: 'blocked',
      })),
    ];

    return out;
  }
}

/* ----------------- helpers ----------------- */

function buildLocalDateTime(dateYYYYMMDD: string, timeHHmm: string) {
  const [y, m, d] = dateYYYYMMDD.split('-').map(Number);
  const [hh, mm] = timeHHmm.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

function isFiniteDate(d: Date) {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function getWeekdayKeyLocal(date: Date) {
  const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  return keyMap[date.getDay()];
}

function timeToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  return h * 60 + m;
}

function isWithinBusinessHours(
  startAt: Date,
  endAt: Date,
  template: Record<string, [string, string][]>,
) {
  const weekday = getWeekdayKeyLocal(startAt);
  const intervals = template?.[weekday] ?? [];
  if (!Array.isArray(intervals) || intervals.length === 0) return false;

  const sMin = startAt.getHours() * 60 + startAt.getMinutes();
  const eMin = endAt.getHours() * 60 + endAt.getMinutes();

  return intervals.some(([start, end]) => {
    const a = timeToMinutes(start);
    const b = timeToMinutes(end);
    return sMin >= a && eMin <= b;
  });
}

function dayUtcRange(dateYYYYMMDD: string) {
  const [yStr, mStr, dStr] = dateYYYYMMDD.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);

  if (!y || !m || !d) {
    throw new BadRequestException('date inválido. Use YYYY-MM-DD.');
  }

  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  return { start, end };
}
