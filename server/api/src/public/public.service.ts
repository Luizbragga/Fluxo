import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, AppointmentState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicBookingData(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        name: true,
        bookingIntervalMin: true,
        businessHoursTemplate: true,
        tenantId: true,
      },
    });

    if (!location) throw new NotFoundException('Location não encontrada.');

    const [services, providers] = await Promise.all([
      this.prisma.service.findMany({
        where: { locationId },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
        },
        orderBy: { name: 'asc' },
      }),

      this.prisma.provider.findMany({
        where: { locationId },
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
      },
    });

    if (!location) throw new NotFoundException('Location não encontrada.');

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, locationId: location.id },
      select: { id: true, durationMin: true, name: true, priceCents: true },
    });

    if (!service) {
      throw new BadRequestException('Serviço inválido para esta location.');
    }

    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, locationId: location.id },
      select: { id: true },
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

    // não permite passado
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

    // expediente
    const tpl = (location.businessHoursTemplate ?? {}) as Record<
      string,
      [string, string][]
    >;

    if (!isWithinBusinessHours(startAt, endAt, tpl)) {
      throw new BadRequestException('Horário fora do expediente.');
    }

    // conflito (overlap) — considera qualquer coisa que não esteja cancelled
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

    // (opcional) cria/associa Customer pelo phone (teu schema tem unique (tenantId, phone))
    // Se tu NÃO quiser criar customer agora, apaga este bloco e não envia customerId.
    let customerId: string | undefined;
    const phone = dto.customerPhone.trim();
    const name = dto.customerName.trim();

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

      // snapshots obrigatórios no teu schema:
      serviceName: service.name,
      serviceDurationMin: service.durationMin,
      servicePriceCents: service.priceCents,

      startAt,
      endAt,

      // teu schema usa clientName/clientPhone (não customerName/customerPhone)
      clientName: name,
      clientPhone: phone,

      status: AppointmentState.scheduled,

      // opcionais
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
