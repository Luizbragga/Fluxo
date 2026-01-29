import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentState, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';
import { CreatePublicCheckoutDto } from './dto/create-public-checkout.dto';
import Stripe from 'stripe';

type PublicRange = {
  id: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status:
    | 'pending_payment'
    | 'scheduled'
    | 'in_service'
    | 'done'
    | 'no_show'
    | 'cancelled'
    | 'blocked';
};

type ResolvedLocation = {
  tenantId: string;
  id: string;
  name: string;
  slug: string;
  active: boolean;
  bookingIntervalMin: number | null;
  businessHoursTemplate: any;
  bookingPaymentPolicy: 'offline_only' | 'online_optional' | 'online_required';
  bookingDepositPercent: number;
};

@Injectable()
export class PublicService {
  private stripe: Stripe | null = null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      this.stripe = new Stripe(key, {
        apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
      });
    }
  }

  private requireStripe() {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe não configurado (STRIPE_SECRET_KEY ausente).',
      );
    }
    return this.stripe;
  }

  // -----------------------------
  // Helpers (slug -> location)
  // -----------------------------
  private async resolveLocationBySlug(
    tenantSlug: string,
    locationSlug: string,
  ): Promise<ResolvedLocation> {
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
      select: {
        tenantId: true,
        id: true,
        name: true,
        slug: true,
        active: true,
        bookingIntervalMin: true,
        businessHoursTemplate: true,
        bookingPaymentPolicy: true,
        bookingDepositPercent: true,
      },
    });

    if (!location || !location.active) {
      throw new NotFoundException('Location não encontrada.');
    }

    return {
      ...location,
      bookingPaymentPolicy: location.bookingPaymentPolicy as any,
      bookingDepositPercent: Number(location.bookingDepositPercent ?? 0),
    };
  }

  // -----------------------------
  // PUBLIC BOOKING DATA (slug)
  // -----------------------------
  async getPublicBookingDataBySlug(tenantSlug: string, locationSlug: string) {
    const location = await this.resolveLocationBySlug(tenantSlug, locationSlug);

    const [services, providers] = await Promise.all([
      this.prisma.service.findMany({
        where: { locationId: location.id, active: true },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
        },
        orderBy: { name: 'asc' },
      }),

      this.prisma.provider.findMany({
        where: { locationId: location.id, active: true },
        select: {
          id: true,
          name: true,
          user: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      location: {
        id: location.id,
        name: location.name,
        slug: location.slug,
        tenantId: location.tenantId,
        bookingIntervalMin: location.bookingIntervalMin,
        businessHoursTemplate: location.businessHoursTemplate,
        active: location.active,

        bookingPaymentPolicy: location.bookingPaymentPolicy,
        bookingDepositPercent: location.bookingDepositPercent,
      },
      services,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name ?? p.user?.name ?? 'Profissional',
      })),
    };
  }

  // -----------------------------
  // CREATE APPOINTMENT OFFLINE (slug)
  // - se policy = online_required -> bloqueia e manda usar /checkout
  // -----------------------------
  async createPublicAppointmentBySlug(
    tenantSlug: string,
    locationSlug: string,
    dto: CreatePublicAppointmentDto,
  ) {
    const location = await this.resolveLocationBySlug(tenantSlug, locationSlug);

    if (location.bookingPaymentPolicy === 'online_required') {
      throw new BadRequestException(
        'Pagamento online obrigatório nesta unidade. Use o endpoint /checkout.',
      );
    }

    return this.createPublicAppointmentCore(location, dto, {
      status: AppointmentState.scheduled,
    });
  }

  // -----------------------------
  // CHECKOUT (Stripe) + policy (slug)
  // -----------------------------
  async createCheckoutBySlug(
    tenantSlug: string,
    locationSlug: string,
    dto: CreatePublicCheckoutDto,
  ) {
    const location = await this.resolveLocationBySlug(tenantSlug, locationSlug);

    // offline_only -> nunca cria checkout
    if (location.bookingPaymentPolicy === 'offline_only') {
      return this.createPublicAppointmentCore(location, dto as any, {
        status: AppointmentState.scheduled,
      });
    }

    // online_optional -> cliente escolhe; default = offline
    const payOnline =
      location.bookingPaymentPolicy === 'online_optional'
        ? !!dto.payOnline
        : true;

    // online_optional com payOnline=false -> cria offline normal
    if (location.bookingPaymentPolicy === 'online_optional' && !payOnline) {
      return this.createPublicAppointmentCore(location, dto as any, {
        status: AppointmentState.scheduled,
      });
    }

    // online_required OU online_optional com payOnline=true
    const stripe = this.requireStripe();

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, locationId: location.id, active: true },
      select: { id: true, durationMin: true, name: true, priceCents: true },
    });

    if (!service) {
      throw new BadRequestException('Serviço inválido para esta location.');
    }

    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, locationId: location.id, active: true },
      select: { id: true },
    });

    if (!provider) {
      throw new BadRequestException(
        'Profissional inválido para esta location.',
      );
    }

    // cria appointment pendente (segura o slot)
    const createdPending = await this.createPublicAppointmentCore(
      location,
      dto as any,
      { status: AppointmentState.pending_payment },
    );

    const appointmentId = createdPending?.appointment?.id;
    if (!appointmentId) {
      throw new BadRequestException('Falha ao criar agendamento pendente.');
    }

    // sinal vs total
    const percent = clampInt(location.bookingDepositPercent ?? 0, 0, 100);
    const kind = percent > 0 && percent < 100 ? 'deposit' : 'full';
    const amountCents =
      kind === 'deposit'
        ? Math.max(50, Math.round((service.priceCents * percent) / 100))
        : service.priceCents;

    const bookingPayment = await this.prisma.bookingPayment.create({
      data: {
        tenantId: location.tenantId,
        locationId: location.id,
        appointmentId,

        kind: kind as any,
        status: 'processing' as any,

        amountCents,
        currency: 'EUR',
      },
      select: { id: true },
    });

    const frontBase = process.env.STRIPE_PUBLIC_BASE_URL;
    if (!frontBase) {
      throw new BadRequestException('STRIPE_PUBLIC_BASE_URL não configurado.');
    }

    const successUrl = `${frontBase}/book/${tenantSlug}/${locationSlug}?success=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontBase}/book/${tenantSlug}/${locationSlug}?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: amountCents,
            product_data: {
              name:
                kind === 'deposit'
                  ? `Sinal (${percent}%) · ${service.name}`
                  : service.name,
            },
          },
        },
      ],
      metadata: {
        tenantId: location.tenantId,
        locationId: location.id,
        appointmentId,
        bookingPaymentId: bookingPayment.id,
      },
    });

    await this.prisma.bookingPayment.update({
      where: { id: bookingPayment.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return {
      ok: true,
      mode: 'stripe',
      checkoutUrl: session.url,
      appointmentId,
    };
  }

  // -----------------------------
  // DISPONIBILIDADE DO DIA (slug)
  // appointments + blocks
  // -----------------------------
  async getPublicDayAppointmentsBySlug(params: {
    tenantSlug: string;
    locationSlug: string;
    providerId: string;
    date: string; // YYYY-MM-DD
  }): Promise<PublicRange[]> {
    const { tenantSlug, locationSlug, providerId, date } = params;

    if (!tenantSlug || !locationSlug || !providerId || !date) {
      throw new BadRequestException(
        'tenantSlug, locationSlug, providerId e date são obrigatórios.',
      );
    }

    const location = await this.resolveLocationBySlug(tenantSlug, locationSlug);
    const { start, end } = dayUtcRange(date);

    const appts = await this.prisma.appointment.findMany({
      where: {
        locationId: location.id,
        providerId,
        startAt: { gte: start },
        endAt: { lte: end },
      },
      select: { id: true, startAt: true, endAt: true, status: true },
      orderBy: { startAt: 'asc' },
    });

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

    return [
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
        status: 'blocked' as const,
      })),
    ];
  }

  // -----------------------------
  // CORE: cria appointment com validações
  // -----------------------------
  private async createPublicAppointmentCore(
    location: ResolvedLocation,
    dto: CreatePublicAppointmentDto,
    opts: { status: AppointmentState },
  ) {
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, locationId: location.id, active: true },
      select: { id: true, durationMin: true, name: true, priceCents: true },
    });

    if (!service) {
      throw new BadRequestException('Serviço inválido para esta location.');
    }

    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, locationId: location.id, active: true },
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

    // conflito com BLOCKS
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

    // conflito com appointments — considera qualquer coisa que não esteja cancelled
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
    const phone = dto.customerPhone?.trim();
    const name = dto.customerName?.trim();

    if (!phone || !name) {
      throw new BadRequestException(
        'Nome e telefone do cliente são obrigatórios.',
      );
    }

    const existingCustomer = await this.prisma.customer.findUnique({
      where: { tenant_phone_unique: { tenantId: location.tenantId, phone } },
      select: { id: true },
    });

    const customerId =
      existingCustomer?.id ??
      (
        await this.prisma.customer.create({
          data: { tenantId: location.tenantId, name, phone },
          select: { id: true },
        })
      ).id;

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

      status: opts.status,
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

function clampInt(value: number, min: number, max: number) {
  const v = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(min, Math.min(max, v));
}

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
