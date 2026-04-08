// src/appointments/appointments.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateAppointmentPaymentDto } from './dto/create-appointment-payment.dto';
import { addMinutes, isBefore } from 'date-fns';
import { AllowedAppointmentStatusEnum } from './dto/update-status.dto';
import { AppointmentState, BookingPaymentPolicy } from '@prisma/client';
import {
  CustomerPlanStatus,
  CustomerPlanPaymentStatus,
  Role,
  BookingPaymentStatus,
} from '@prisma/client';
import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import Stripe from 'stripe';

const DEFAULT_COMMISSION_PERCENTAGE = 50; // 50% por padrão (ajustável)
const PAYMENT_MANAGERS = new Set<Role>([
  Role.owner,
  Role.admin,
  Role.attendant,
]);
const REFUND_MANAGERS = new Set<Role>([Role.owner, Role.admin]);

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly smsService: SmsService,
    private readonly notifications: NotificationsService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      this.stripe = new Stripe(key, {
        apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
      });
    }
  }

  private async assertMinCancelNotice(
    tenantId: string,
    appointmentStartAt: Date,
    actorRole: Role,
    action: 'cancel' | 'reschedule',
  ) {
    // Owner/Admin podem sempre fazer override
    if (actorRole === Role.owner || actorRole === Role.admin) return;

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { minCancelNoticeHours: true },
    });

    const hours = settings?.minCancelNoticeHours ?? 0;
    if (!hours || hours <= 0) return;

    const now = new Date();
    const cutoff = addMinutes(appointmentStartAt, -hours * 60);

    if (now > cutoff) {
      const verb = action === 'cancel' ? 'cancelar' : 'reagendar';

      throw new BadRequestException({
        code: 'MIN_CANCEL_NOTICE',
        message: `Não é possível ${verb} com menos de ${hours}h de antecedência.`,
        minNoticeHours: hours,
        appointmentStartAt: appointmentStartAt.toISOString(),
        cutoffAt: cutoff.toISOString(),
      });
    }
  }

  private async getTenantTimezone(tenantId: string) {
    return (
      (
        await this.prisma.tenantSettings.findUnique({
          where: { tenantId },
          select: { timezone: true },
        })
      )?.timezone ?? 'Europe/Lisbon'
    );
  }
  private stripe: Stripe | null = null;

  private requireStripe() {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe não configurado (STRIPE_SECRET_KEY ausente).',
      );
    }
    return this.stripe;
  }

  private formatPtDateTime(date: Date, tz: string) {
    return date.toLocaleString('pt-PT', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async create(
    tenantId: string,
    userId: string,
    actorRole: Role,
    dto: CreateAppointmentDto,
  ) {
    const startAt = new Date(dto.startAt);
    let endAt = new Date(dto.endAt);
    // ----------------------------------------------------------------
    // SECURITY: se for PROVIDER, força providerId = o próprio profissional logado
    // ----------------------------------------------------------------
    if (actorRole === Role.provider) {
      const meProvider = await this.prisma.provider.findFirst({
        where: { tenantId, userId },
        select: { id: true },
      });

      if (!meProvider?.id) {
        throw new ForbiddenException(
          'Este usuário provider não está vinculado a um profissional.',
        );
      }

      dto.providerId = meProvider.id; // força (ignora qualquer providerId vindo do front)
    }

    // ----------------------------------------------------------------
    // TELEFONE: normaliza 1 vez (PT -> 351 + E.164)
    // ----------------------------------------------------------------
    const phoneDigitsRaw = (dto.clientPhone ?? '').replace(/\D+/g, '');
    if (!phoneDigitsRaw) {
      throw new BadRequestException('Telefone do cliente é obrigatório.');
    }

    // padroniza SEMPRE com código PT (351) para evitar duplicados
    const phoneDigitsPt = phoneDigitsRaw.startsWith('351')
      ? phoneDigitsRaw
      : phoneDigitsRaw.length === 9
        ? `351${phoneDigitsRaw}`
        : phoneDigitsRaw; // fallback

    const clientPhoneE164 = `+${phoneDigitsPt}`;

    // ----------------------------------------------------------------
    // Provider válido e do tenant
    // ----------------------------------------------------------------
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
      select: {
        id: true,
        tenantId: true,
        locationId: true,
      },
    });

    if (!provider || provider.tenantId !== tenantId) {
      throw new ForbiddenException('Provider inválido para este tenant.');
    }

    // ----------------------------------------------------------------
    // Service válido e do tenant
    // ----------------------------------------------------------------
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service || service.tenantId !== tenantId) {
      throw new ForbiddenException('Service inválido para este tenant.');
    }

    // Valores “efetivos” (podem mudar se for plano com combo)
    let effectiveDurationMin = service.durationMin;
    let effectiveServicePriceCents = service.priceCents;
    let effectiveServiceName = service.name;

    const formatMinutesToTime = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // ----------------------------------------------------------------
    // LÓGICA DE PLANO DO CLIENTE (CustomerPlan)
    // ----------------------------------------------------------------
    let customerPlanId: string | null = null;

    if (dto.customerPlanId) {
      const customerPlan = await this.prisma.customerPlan.findFirst({
        where: {
          id: dto.customerPlanId,
          tenantId,
          status: CustomerPlanStatus.active,
          OR: [{ locationId: provider.locationId }, { locationId: null }],
        },
        include: { planTemplate: true },
      });

      if (!customerPlan) {
        throw new BadRequestException(
          'Plano do cliente inválido para este tenant/local ou não está ativo.',
        );
      }

      customerPlanId = customerPlan.id;
      const template = customerPlan.planTemplate;

      // 1) Restrições de serviço do plano
      if (template?.sameDayServiceIds) {
        const allowedServiceIds =
          template.sameDayServiceIds as unknown as string[];

        if (
          Array.isArray(allowedServiceIds) &&
          allowedServiceIds.length > 0 &&
          !allowedServiceIds.includes(dto.serviceId)
        ) {
          throw new BadRequestException(
            'Este serviço não faz parte do plano selecionado.',
          );
        }
      }

      // 2) Dias da semana permitidos
      if (template && template.allowedWeekdays) {
        const rawWeekdays = template.allowedWeekdays as any;

        const allowedNumbers: number[] = (
          Array.isArray(rawWeekdays) ? rawWeekdays : []
        )
          .map((v) => (typeof v === 'string' ? Number(v) : v))
          .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);

        if (allowedNumbers.length > 0) {
          const weekdayIndex = startAt.getDay();

          if (!allowedNumbers.includes(weekdayIndex)) {
            const weekdayLabel: Record<number, string> = {
              0: 'domingo',
              1: 'segunda-feira',
              2: 'terça-feira',
              3: 'quarta-feira',
              4: 'quinta-feira',
              5: 'sexta-feira',
              6: 'sábado',
            };

            const allowedLabels = allowedNumbers
              .sort((a, b) => a - b)
              .map((n) => weekdayLabel[n] ?? String(n))
              .join(', ');

            throw new BadRequestException(
              `Este plano só permite agendamentos nos dias: ${allowedLabels}.`,
            );
          }
        }
      }

      // 3) Antecedência mínima (minAdvanceDays)
      if (template?.minAdvanceDays && template.minAdvanceDays > 0) {
        const now = new Date();

        const todayUtc = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0,
          ),
        );
        const apptDateUtc = new Date(
          Date.UTC(
            startAt.getUTCFullYear(),
            startAt.getUTCMonth(),
            startAt.getUTCDate(),
            0,
            0,
            0,
          ),
        );

        const diffMs = apptDateUtc.getTime() - todayUtc.getTime();
        const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

        if (diffDays < template.minAdvanceDays) {
          throw new BadRequestException(
            `Este plano exige agendamento com pelo menos ${template.minAdvanceDays} dia(s) de antecedência.`,
          );
        }
      }

      // 4) Intervalo mínimo entre visitas (minDaysBetweenVisits)
      if (template?.minDaysBetweenVisits && template.minDaysBetweenVisits > 0) {
        const lastVisit = await this.prisma.appointment.findFirst({
          where: {
            tenantId,
            customerPlanId: customerPlan.id,
            status: {
              in: ['scheduled', 'in_service', 'done', 'no_show'] as any,
            },
            startAt: { lt: startAt },
          },
          orderBy: { startAt: 'desc' },
          select: { startAt: true },
        });

        if (lastVisit) {
          const lastDateUtc = new Date(
            Date.UTC(
              lastVisit.startAt.getUTCFullYear(),
              lastVisit.startAt.getUTCMonth(),
              lastVisit.startAt.getUTCDate(),
              0,
              0,
              0,
            ),
          );
          const apptDateUtc = new Date(
            Date.UTC(
              startAt.getUTCFullYear(),
              startAt.getUTCMonth(),
              startAt.getUTCDate(),
              0,
              0,
              0,
            ),
          );

          const diffMs = apptDateUtc.getTime() - lastDateUtc.getTime();
          const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

          if (diffDays < template.minDaysBetweenVisits) {
            throw new BadRequestException(
              `O plano exige um intervalo mínimo de ${template.minDaysBetweenVisits} dia(s) entre visitas.`,
            );
          }
        }
      }

      // 5) Ciclo do plano + controle de visitas (timestamp, fim EXCLUSIVO)
      // Regra: válido se startAt >= currentCycleStart && startAt < currentCycleEnd
      if (startAt >= customerPlan.currentCycleEnd) {
        await this.prisma.customerPlan.update({
          where: { id: customerPlan.id },
          data: {
            status: CustomerPlanStatus.late,
            lastPaymentStatus: CustomerPlanPaymentStatus.late,
          },
        });

        throw new BadRequestException(
          'Plano do cliente está com pagamento em atraso e foi bloqueado. Regista o pagamento para voltar a agendar.',
        );
      }

      if (startAt < customerPlan.currentCycleStart) {
        throw new BadRequestException(
          'Data do agendamento está fora do ciclo atual do plano do cliente.',
        );
      }

      const visitsLimit =
        template.visitsPerInterval + customerPlan.carryOverVisits;

      const nextVisitsUsed = customerPlan.visitsUsedInCycle + 1;

      if (nextVisitsUsed > visitsLimit) {
        throw new BadRequestException(
          'Cliente já utilizou todas as visitas disponíveis neste ciclo do plano.',
        );
      }

      // NÃO incrementa aqui.
      // A visita será consumida APÓS o appointment ser criado com sucesso.

      // 6) Ajuste de duração / preço para combos
      if (template?.sameDayServiceIds) {
        const comboIds = template.sameDayServiceIds as unknown as string[];

        if (Array.isArray(comboIds) && comboIds.length > 0) {
          const comboServices = await this.prisma.service.findMany({
            where: { tenantId, id: { in: comboIds } },
          });

          if (comboServices.length > 0) {
            effectiveDurationMin = comboServices.reduce(
              (sum, srv) => sum + srv.durationMin,
              0,
            );

            effectiveServicePriceCents = comboServices.reduce(
              (sum, srv) => sum + srv.priceCents,
              0,
            );

            effectiveServiceName = template.name ?? service.name;
          }
        }
      }

      // 7) Janela de horário do plano (usa duração efetiva)
      if (
        template?.allowedStartTimeMinutes != null &&
        template.allowedEndTimeMinutes != null
      ) {
        const startMinutes = startAt.getHours() * 60 + startAt.getMinutes();
        const endMinutes = startMinutes + effectiveDurationMin;

        const from = formatMinutesToTime(template.allowedStartTimeMinutes);
        const to = formatMinutesToTime(template.allowedEndTimeMinutes);

        if (
          startMinutes < template.allowedStartTimeMinutes ||
          endMinutes > template.allowedEndTimeMinutes
        ) {
          throw new BadRequestException(
            `Este plano só pode ser utilizado entre ${from} e ${to}.`,
          );
        }
      }

      // endAt sempre baseado na duração efetiva do plano
      endAt = addMinutes(startAt, effectiveDurationMin);
    }

    // normaliza endAt se inválido
    if (Number.isNaN(endAt.getTime())) {
      endAt = addMinutes(startAt, effectiveDurationMin);
    }

    if (isBefore(endAt, startAt)) {
      throw new BadRequestException('endAt deve ser após startAt.');
    }

    // avulso: garante duração do serviço
    if (!dto.customerPlanId) {
      const expectedEnd = addMinutes(startAt, service.durationMin);
      if (expectedEnd.getTime() !== endAt.getTime()) {
        throw new BadRequestException(
          `Duração deve ser ${service.durationMin} minutos.`,
        );
      }
    }

    // ----------------------------------------------------------------
    // SETTINGS DO TENANT (buffer/overbooking)
    // ----------------------------------------------------------------
    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        bufferBetweenAppointmentsMin: true,
        allowOverbooking: true,
      },
    });

    const bufferMinRaw = tenantSettings?.bufferBetweenAppointmentsMin ?? 0;
    const bufferMin = Number.isFinite(bufferMinRaw)
      ? Math.max(0, bufferMinRaw)
      : 0;

    const allowOverbooking = !!tenantSettings?.allowOverbooking;

    const startAtBuffered =
      bufferMin > 0 ? addMinutes(startAt, -bufferMin) : startAt;
    const endAtBuffered = bufferMin > 0 ? addMinutes(endAt, bufferMin) : endAt;

    // ----------------------------------------------------------------
    // CONFLITO COM BLOCKS
    // ----------------------------------------------------------------
    const hasBlockConflict = await this.prisma.block.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        startAt: { lt: endAtBuffered },
        endAt: { gt: startAtBuffered },
      },
      select: { id: true },
    });

    if (hasBlockConflict) {
      throw new BadRequestException('Conflito com bloqueio de agenda.');
    }

    // ----------------------------------------------------------------
    // CONFLITO COM OUTROS APPOINTMENTS (ignora cancelados)
    // ----------------------------------------------------------------
    if (!allowOverbooking) {
      const hasApptConflict = await this.prisma.appointment.findFirst({
        where: {
          tenantId,
          providerId: dto.providerId,
          status: { not: 'cancelled' as any },
          startAt: { lt: endAtBuffered },
          endAt: { gt: startAtBuffered },
        },
        select: { id: true },
      });

      if (hasApptConflict) {
        throw new BadRequestException('Conflito com outro agendamento.');
      }
    }

    // ----------------------------------------------------------------
    // CLIENTE: 1 registro por telefone por tenant
    // ----------------------------------------------------------------
    const normalizedPhone = phoneDigitsPt; // sem "+"
    const newNameNorm = dto.clientName.trim().toLowerCase();

    let customerId: string;

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { tenantId, phone: normalizedPhone },
    });

    if (!existingCustomer) {
      const created = await this.prisma.customer.create({
        data: {
          tenantId,
          name: dto.clientName.trim(),
          phone: normalizedPhone,
        },
      });
      customerId = created.id;
    } else {
      const existingNameNorm = existingCustomer.name.trim().toLowerCase();

      if (existingNameNorm !== newNameNorm) {
        throw new BadRequestException({
          code: 'CUSTOMER_NAME_CONFLICT',
          message:
            'Já existe um cliente com este telefone registado com outro nome.',
          existingCustomer: {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
          },
          proposedName: dto.clientName,
        });
      }

      customerId = existingCustomer.id;
    }

    // ----------------------------------------------------------------
    // CRIA O APPOINTMENT + CONSOME VISITA (TRANSACÇÃO)
    // ----------------------------------------------------------------
    const appointment = await this.prisma.$transaction(async (tx) => {
      // Re-checagem da cota do plano dentro da transação (evita corrida)
      if (customerPlanId) {
        const plan = await tx.customerPlan.findFirst({
          where: {
            id: customerPlanId,
            tenantId,
            status: CustomerPlanStatus.active,
          },
          select: {
            id: true,
            currentCycleStart: true,
            currentCycleEnd: true,
            visitsUsedInCycle: true,
            carryOverVisits: true,
            planTemplate: {
              select: {
                visitsPerInterval: true,
              },
            },
          },
        });

        if (!plan) {
          throw new BadRequestException(
            'Plano do cliente inválido ou inativo.',
          );
        }

        // Regra de ciclo (fim EXCLUSIVO) — mesma regra que você já ajustou
        if (startAt >= plan.currentCycleEnd) {
          await tx.customerPlan.update({
            where: { id: plan.id },
            data: {
              status: CustomerPlanStatus.late,
              lastPaymentStatus: CustomerPlanPaymentStatus.late,
            },
          });

          throw new BadRequestException(
            'Plano do cliente está com pagamento em atraso e foi bloqueado. Regista o pagamento para voltar a agendar.',
          );
        }

        if (startAt < plan.currentCycleStart) {
          throw new BadRequestException(
            'Data do agendamento está fora do ciclo atual do plano do cliente.',
          );
        }

        const limit =
          (plan.planTemplate?.visitsPerInterval ?? 0) +
          (plan.carryOverVisits ?? 0);
        const nextUsed = (plan.visitsUsedInCycle ?? 0) + 1;

        if (nextUsed > limit) {
          throw new BadRequestException(
            'Cliente já utilizou todas as visitas disponíveis neste ciclo do plano.',
          );
        }
      }

      // Cria o appointment dentro da transação
      const created = await tx.appointment.create({
        data: {
          tenantId,
          providerId: dto.providerId,
          locationId: provider.locationId,
          serviceId: dto.serviceId,
          startAt,
          endAt,
          clientName: dto.clientName,
          clientPhone: clientPhoneE164,
          createdById: userId,

          serviceName: effectiveServiceName,
          serviceDurationMin: effectiveDurationMin,
          servicePriceCents: effectiveServicePriceCents,

          customerId,
          customerPlanId,
        },
        include: {
          service: { select: { id: true, name: true, durationMin: true } },
          provider: { select: { id: true, name: true } },
        },
      });

      // Consome visita após o appointment existir, dentro da transação
      if (customerPlanId) {
        await tx.customerPlan.update({
          where: { id: customerPlanId },
          data: { visitsUsedInCycle: { increment: 1 } },
        });
      }

      return created;
    });
    // ✅ Notificação IN-APP para o provider (novo agendamento)
    try {
      const tz = await this.getTenantTimezone(tenantId);
      const when = this.formatPtDateTime(appointment.startAt, tz);

      await this.notifyProviderInApp(tenantId, appointment.providerId, {
        type: 'appointment_created',
        title: 'Novo agendamento',
        message: `${appointment.clientName} • ${appointment.serviceName} • ${when}`,
        data: { appointmentId: appointment.id },
      });
    } catch (e) {
      this.logger.warn(
        `[NOTIF] Falha ao criar notificação: ${e?.message ?? e}`,
      );
    }

    // ✅ SMS de confirmação (não pode quebrar o agendamento se falhar)
    try {
      const to = appointment.clientPhone; // já está em E.164
      const tz = await this.getTenantTimezone(tenantId);
      const when = this.formatPtDateTime(appointment.startAt, tz);

      const msg =
        `Fluxo ✅ Agendamento confirmado!\n` +
        `Cliente: ${appointment.clientName}\n` +
        `Serviço: ${appointment.serviceName}\n` +
        `Profissional: ${appointment.provider?.name ?? '—'}\n` +
        `Data/Hora: ${when}`;

      await this.smsService.sendSms(to, msg);
    } catch (e) {
      this.logger.warn(`[SMS] Falha ao enviar confirmação: ${e?.message ?? e}`);
    }

    // ------------------------------------------------------------------
    // FINANCEIRO / EARNING
    // ------------------------------------------------------------------
    const commissionRule = await this.prisma.providerCommission.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        active: true,
        OR: [{ serviceId: dto.serviceId }, { serviceId: null }],
      },
      orderBy: { serviceId: 'desc' },
    });

    const commissionPercentage =
      commissionRule?.percentage ?? DEFAULT_COMMISSION_PERCENTAGE;

    const providerEarningsCents = Math.round(
      (appointment.servicePriceCents * commissionPercentage) / 100,
    );

    const houseEarningsCents =
      appointment.servicePriceCents - providerEarningsCents;

    await this.prisma.appointmentEarning.create({
      data: {
        appointmentId: appointment.id,
        servicePriceCents: appointment.servicePriceCents,
        commissionPercentage,
        providerEarningsCents,
        houseEarningsCents,
      },
    });

    // ------------------------------------------------------------------
    // EMAIL: NOVO AGENDAMENTO (não quebra a criação se falhar)
    // ------------------------------------------------------------------
    this.notifyNewBooking(tenantId, appointment.id).catch((err) => {
      this.logger.warn(
        `Falha ao enviar emails de novo agendamento: ${err?.message ?? err}`,
      );
    });

    return appointment;
  }

  private async notifyProviderInApp(
    tenantId: string,
    providerId: string,
    payload: {
      type: string;
      title: string;
      message: string;
      data?: any;
    },
  ) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        notifyProvidersNewBooking: true,
        notifyProvidersChanges: true,
      },
    });

    if (!settings) return;

    const isNewBooking = payload.type === 'appointment_created';
    const allow = isNewBooking
      ? (settings.notifyProvidersNewBooking ?? true)
      : (settings.notifyProvidersChanges ?? true);

    if (!allow) return;

    // provider -> userId (destinatário real)
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { userId: true },
    });

    if (!provider?.userId) return;

    await this.notifications.create({
      tenantId,
      userId: provider.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: payload.data ?? undefined,
    });
  }

  // LISTA DO DIA ---------------------------------------------------------------
  async findByDay(
    tenantId: string,
    dateYYYYMMDD: string,
    providerId?: string,
    locationId?: string,
    actorUserId?: string,
    actorRole?: string,
  ) {
    const [yStr, mStr, dStr] = dateYYYYMMDD.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);

    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

    // Guardrail MVP: provider só pode ver a própria agenda
    if (actorRole === 'provider') {
      const meProvider = await this.prisma.provider.findFirst({
        where: { tenantId, userId: actorUserId },
        select: { id: true },
      });

      if (!meProvider) {
        throw new BadRequestException('Provider do utilizador não encontrado.');
      }

      providerId = meProvider.id; // força a query
    }
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        startAt: { gte: start },
        endAt: { lte: end },
        ...(providerId ? { providerId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  // REAGENDAR ------------------------------------------------------------------
  async reschedule(
    tenantId: string,
    appointmentId: string,
    dto: { startAt?: string; endAt?: string },
    actorUserId: string,
    actorRole: Role,
  ) {
    const { updated, oldStartAt } = await this.prisma.$transaction(
      async (tx: any) => {
        const current = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId },
          include: {
            service: { select: { id: true, durationMin: true } },
            provider: { select: { id: true, userId: true } },
          },
        });

        if (!current) {
          throw new NotFoundException('Appointment não encontrado no tenant');
        }
        if (
          actorRole === Role.provider &&
          current.provider?.userId !== actorUserId
        ) {
          throw new ForbiddenException(
            'Sem permissão para reagendar este agendamento.',
          );
        }
        await this.assertMinCancelNotice(
          tenantId,
          current.startAt,
          actorRole,
          'reschedule',
        );

        const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
        const endAt = dto.endAt
          ? new Date(dto.endAt)
          : new Date(startAt.getTime() + current.service.durationMin * 60_000);

        if (isNaN(startAt.getTime()))
          throw new BadRequestException('startAt inválido');
        if (isNaN(endAt.getTime()))
          throw new BadRequestException('endAt inválido');
        if (endAt <= startAt)
          throw new BadRequestException('endAt deve ser maior que startAt');

        // Se tem plano: garantir nova data dentro do ciclo atual
        if (current.customerPlanId) {
          const customerPlan = await tx.customerPlan.findUnique({
            where: { id: current.customerPlanId },
            select: {
              id: true,
              status: true,
              currentCycleStart: true,
              currentCycleEnd: true,
            },
          });

          if (
            !customerPlan ||
            customerPlan.status !== CustomerPlanStatus.active
          ) {
            throw new BadRequestException(
              'Plano do cliente não está mais ativo para reagendar este agendamento.',
            );
          }

          if (startAt > customerPlan.currentCycleEnd) {
            await tx.customerPlan.update({
              where: { id: customerPlan.id },
              data: {
                status: CustomerPlanStatus.late,
                lastPaymentStatus: CustomerPlanPaymentStatus.late,
              },
            });

            throw new BadRequestException(
              'Plano do cliente está com pagamento em atraso e foi bloqueado. Não é possível reagendar até regularizar.',
            );
          }

          if (
            startAt < customerPlan.currentCycleStart ||
            startAt > customerPlan.currentCycleEnd
          ) {
            throw new BadRequestException(
              'Nova data do agendamento está fora do ciclo atual do plano do cliente.',
            );
          }
        }

        const tenantSettings = await tx.tenantSettings.findUnique({
          where: { tenantId },
          select: {
            bufferBetweenAppointmentsMin: true,
            allowOverbooking: true,
          },
        });

        const bufferMinRaw = tenantSettings?.bufferBetweenAppointmentsMin ?? 0;
        const bufferMin = Number.isFinite(bufferMinRaw)
          ? Math.max(0, bufferMinRaw)
          : 0;

        const allowOverbooking = !!tenantSettings?.allowOverbooking;

        const startAtBuffered =
          bufferMin > 0 ? addMinutes(startAt, -bufferMin) : startAt;
        const endAtBuffered =
          bufferMin > 0 ? addMinutes(endAt, bufferMin) : endAt;

        // conflito com OUTROS appointments (ignora cancelados e o próprio)
        if (!allowOverbooking) {
          const overlapAppointment = await tx.appointment.findFirst({
            where: {
              tenantId,
              providerId: current.providerId,
              id: { not: current.id },
              status: { not: 'cancelled' as any },
              startAt: { lt: endAtBuffered },
              endAt: { gt: startAtBuffered },
            },
            select: { id: true },
          });

          if (overlapAppointment) {
            throw new BadRequestException(
              'Conflito com outro appointment no intervalo solicitado',
            );
          }
        }

        // conflito com BLOCKS
        const overlapBlock = await tx.block.findFirst({
          where: {
            tenantId,
            providerId: current.providerId,
            startAt: { lt: endAtBuffered },
            endAt: { gt: startAtBuffered },
          },
          select: { id: true },
        });

        if (overlapBlock) {
          throw new BadRequestException(
            'Conflito com um block do provider no intervalo solicitado',
          );
        }

        const updated = await tx.appointment.update({
          where: { id: current.id, tenantId },
          data: { startAt, endAt },
          include: {
            service: { select: { id: true, name: true, durationMin: true } },
            provider: { select: { id: true, name: true } },
          },
        });

        return { updated, oldStartAt: current.startAt };
      },
    );

    // EMAIL (não quebra o reagendamento se falhar)
    this.notifyReschedule(tenantId, appointmentId, oldStartAt).catch((err) => {
      this.logger.warn(
        `Falha ao enviar emails de reagendamento: ${err?.message ?? err}`,
      );
    });

    // SMS (não quebra o reagendamento se falhar)
    try {
      const to = (updated.clientPhone ?? '').trim();

      if (/^\+\d{8,15}$/.test(to)) {
        const tz = await this.getTenantTimezone(tenantId);

        const oldLabel = this.formatPtDateTime(oldStartAt, tz);
        const newLabel = this.formatPtDateTime(updated.startAt, tz);

        const msg =
          `Fluxo 🔁 Agendamento reagendado!\n` +
          `Cliente: ${updated.clientName}\n` +
          `Serviço: ${updated.serviceName}\n` +
          `Antes: ${oldLabel}\n` +
          `Novo: ${newLabel}`;

        await this.smsService.sendSms(to, msg);
      } else {
        this.logger.warn(
          `[SMS] Telefone inválido (não E.164): "${updated.clientPhone}"`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `[SMS] Falha ao enviar reagendamento: ${e?.message ?? e}`,
      );
    }

    // ✅ Notificação IN-APP para o provider (reagendado)
    try {
      const tz = await this.getTenantTimezone(tenantId);
      const oldLabel = this.formatPtDateTime(oldStartAt, tz);
      const newLabel = this.formatPtDateTime(updated.startAt, tz);

      await this.notifyProviderInApp(tenantId, updated.providerId, {
        type: 'appointment_rescheduled',
        title: 'Agendamento reagendado',
        message: `${updated.clientName} • ${updated.serviceName} • ${oldLabel} → ${newLabel}`,
        data: {
          appointmentId: updated.id,
          oldStartAt: oldStartAt.toISOString(),
        },
      });
    } catch (e) {
      this.logger.warn(
        `[NOTIF] Falha ao criar notificação (reagendamento): ${e?.message ?? e}`,
      );
    }

    return updated;
  }

  // ATUALIZAR STATUS -----------------------------------------------------------
  async updateStatus(
    tenantId: string,
    appointmentId: string,
    status: AllowedAppointmentStatusEnum,
    actorUserId: string,
    actorRole: Role,
  ) {
    return this.prisma.$transaction(async (tx: any) => {
      const found = await tx.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        include: {
          service: {
            select: {
              id: true,
              name: true,
              durationMin: true,
              priceCents: true,
            },
          },
          provider: { select: { id: true, name: true, userId: true } },
        },
      });

      if (!found) {
        throw new NotFoundException('Appointment não encontrado no tenant');
      }
      if (
        actorRole === Role.provider &&
        found.provider?.userId !== actorUserId
      ) {
        throw new ForbiddenException(
          'Sem permissão para alterar este agendamento.',
        );
      }
      if (status === AllowedAppointmentStatusEnum.cancelled) {
        throw new BadRequestException(
          'Para cancelar use o endpoint de cancelamento (remove). Isso ajusta plano/financeiro e dispara notificações.',
        );
      }

      // status do banco é Prisma enum
      if (
        found.status === AppointmentState.done &&
        status !== AllowedAppointmentStatusEnum.done
      ) {
        throw new BadRequestException(
          'Appointments concluídos não podem ter o status alterado.',
        );
      }

      const updated = await tx.appointment.update({
        where: { id: found.id, tenantId },
        data: {
          status: status as unknown as AppointmentState,
          ...(status === AllowedAppointmentStatusEnum.no_show
            ? { noShowAt: new Date() }
            : {}),
        },
        include: {
          service: {
            select: {
              id: true,
              name: true,
              durationMin: true,
              priceCents: true,
            },
          },
          provider: { select: { id: true, name: true } },
        },
      });

      // se virou DONE, garante earning existe
      if (status === AllowedAppointmentStatusEnum.done) {
        const existing = await tx.appointmentEarning.findUnique({
          where: { appointmentId: updated.id },
        });

        if (!existing) {
          const commissionPercentage = await this.getCommissionPercentage(
            tx,
            tenantId,
            updated.providerId,
            updated.serviceId,
          );

          const servicePriceCents =
            updated.servicePriceCents ?? updated.service.priceCents;

          const providerEarningsCents = Math.round(
            (servicePriceCents * commissionPercentage) / 100,
          );

          const houseEarningsCents = servicePriceCents - providerEarningsCents;

          await tx.appointmentEarning.create({
            data: {
              appointmentId: updated.id,
              servicePriceCents,
              commissionPercentage,
              providerEarningsCents,
              houseEarningsCents,
            },
          });
        }
      }

      return updated;
    });
  }

  // CANCELAMENTO SEGURO (ajusta plano e financeiro) ---------------------------
  async remove(
    tenantId: string,
    id: string,
    actorUserId: string,
    actorRole: Role,
  ) {
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const appt = await tx.appointment.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          status: true,
          customerPlanId: true,
          startAt: true,
          bookingPayment: {
            select: {
              id: true,
              status: true,
              refundedAt: true,
              kind: true,
              amountCents: true,
            },
          },
          provider: { select: { userId: true } },
        },
      });

      if (!appt) {
        throw new NotFoundException('Appointment não encontrado no tenant');
      }
      if (
        actorRole === Role.provider &&
        appt.provider?.userId !== actorUserId
      ) {
        throw new ForbiddenException(
          'Sem permissão para cancelar este agendamento.',
        );
      }
      await this.assertMinCancelNotice(
        tenantId,
        appt.startAt,
        actorRole,
        'cancel',
      );

      if (appt.status === AppointmentState.done) {
        throw new BadRequestException(
          'Appointments concluídos não podem ser cancelados. Faça um ajuste financeiro manual se necessário.',
        );
      }

      if (appt.status === AppointmentState.cancelled) {
        return tx.appointment.findUnique({
          where: { id },
          include: {
            service: { select: { id: true, name: true, durationMin: true } },
            provider: { select: { id: true, name: true } },
          },
        });
      }

      // devolve visita do plano se aplicável
      if (appt.customerPlanId) {
        const plan = await tx.customerPlan.findUnique({
          where: { id: appt.customerPlanId },
          select: { id: true, visitsUsedInCycle: true },
        });

        if (plan && plan.visitsUsedInCycle > 0) {
          await tx.customerPlan.update({
            where: { id: plan.id },
            data: { visitsUsedInCycle: plan.visitsUsedInCycle - 1 },
          });
        }
      }

      // remove earning se existir
      await tx.appointmentEarning.deleteMany({
        where: { appointmentId: appt.id },
      });
      // --- AUTO-REFUND (MVP) ---
      // Regra: só reembolsa automaticamente quando o cancelamento respeita a antecedência mínima.
      // - Provider/attendant só conseguem cancelar antes do cutoff (por assertMinCancelNotice), então aqui quase sempre será true.
      // - Owner/admin podem cancelar mesmo depois do cutoff (override), então aqui pode ser false.

      const updatedAppointment = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentState.cancelled,
          cancelledAt: new Date(),
        },
        include: {
          service: { select: { id: true, name: true, durationMin: true } },
          provider: { select: { id: true, name: true } },
        },
      });

      return updatedAppointment;
    });

    // EMAIL (não quebra o cancelamento se falhar)
    this.notifyCancellation(tenantId, id).catch((err) => {
      this.logger.warn(
        `Falha ao enviar emails de cancelamento: ${err?.message ?? err}`,
      );
    });

    // SMS (não quebra o cancelamento se falhar)
    try {
      const to = (updated.clientPhone ?? '').trim();

      if (/^\+\d{8,15}$/.test(to)) {
        const tz = await this.getTenantTimezone(tenantId);
        const when = this.formatPtDateTime(updated.startAt, tz);

        const msg =
          `Fluxo ❌ Agendamento cancelado.\n` +
          `Cliente: ${updated.clientName}\n` +
          `Serviço: ${updated.serviceName}\n` +
          `Profissional: ${updated.provider?.name ?? '—'}\n` +
          `Data/Hora: ${when}`;

        await this.smsService.sendSms(to, msg);
      } else {
        this.logger.warn(
          `[SMS] Telefone inválido (não E.164): "${updated.clientPhone}"`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `[SMS] Falha ao enviar cancelamento: ${e?.message ?? e}`,
      );
    }

    // ✅ Notificação IN-APP para o provider (cancelado)
    try {
      const tz = await this.getTenantTimezone(tenantId);
      const when = this.formatPtDateTime(updated.startAt, tz);

      await this.notifyProviderInApp(tenantId, updated.providerId, {
        type: 'appointment_cancelled',
        title: 'Agendamento cancelado',
        message: `${updated.clientName} • ${updated.serviceName} • ${when}`,
        data: { appointmentId: updated.id },
      });
    } catch (e) {
      this.logger.warn(
        `[NOTIF] Falha ao criar notificação (cancelamento): ${e?.message ?? e}`,
      );
    }

    return updated;
  }

  async findOne(tenantId: string, id: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    if (!appt) {
      throw new NotFoundException('Appointment não encontrado no tenant');
    }

    return appt;
  }

  async findDay(tenantId: string, providerId: string, dateISO: string) {
    const day = new Date(dateISO);

    const start = new Date(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const end = new Date(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        23,
        59,
        59,
      ),
    );

    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { gte: start },
        endAt: { lte: end },
      },
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  private async getCommissionPercentage(
    tx: any,
    tenantId: string,
    providerId: string,
    serviceId: string,
  ): Promise<number> {
    const serviceRule = await tx.providerCommission.findFirst({
      where: {
        tenantId,
        providerId,
        serviceId,
        active: true,
      },
    });

    if (serviceRule) return serviceRule.percentage;

    const defaultRule = await tx.providerCommission.findFirst({
      where: {
        tenantId,
        providerId,
        serviceId: null,
        active: true,
      },
    });

    if (defaultRule) return defaultRule.percentage;

    return DEFAULT_COMMISSION_PERCENTAGE;
  }

  // ---------------------------------------------------------------------------
  // EMAIL: NOVO AGENDAMENTO (gestão + provider), respeitando TenantSettings
  // ---------------------------------------------------------------------------
  private async notifyNewBooking(tenantId: string, appointmentId: string) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        emailNewBooking: true,
        notifyProvidersNewBooking: true,
        timezone: true,
      },
    });

    if (!settings) return;
    if (!settings.emailNewBooking && !settings.notifyProvidersNewBooking)
      return;

    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        startAt: true,
        clientName: true,
        clientPhone: true,
        serviceName: true,
        provider: {
          select: { name: true, user: { select: { email: true } } },
        },
        location: { select: { name: true } },
      },
    });

    if (!appt) return;

    const tz = settings.timezone ?? 'Europe/Lisbon';
    const startLabel = this.formatPtDateTime(appt.startAt, tz);

    const subject = `Novo agendamento - ${appt.clientName} (${startLabel})`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.4;">
        <h2>Novo agendamento</h2>
        <p><b>Data/Hora:</b> ${startLabel}</p>
        <p><b>Cliente:</b> ${appt.clientName}</p>
        <p><b>Telefone:</b> ${appt.clientPhone}</p>
        <p><b>Serviço:</b> ${appt.serviceName}</p>
        <p><b>Profissional:</b> ${appt.provider?.name ?? '-'}</p>
        <p><b>Unidade:</b> ${appt.location?.name ?? '-'}</p>
        <hr />
        <p style="color:#666; font-size: 12px;">Fluxo - Notificação automática</p>
      </div>
    `.trim();

    const recipients = new Set<string>();

    // 1) Gestão (owner/admin/attendant)
    if (settings.emailNewBooking) {
      const managers = await this.prisma.user.findMany({
        where: {
          tenantId,
          active: true,
          role: { in: ['owner', 'admin', 'attendant'] as any },
        },
        select: { email: true },
      });

      for (const u of managers) if (u.email) recipients.add(u.email);
    }

    // 2) Provider do agendamento
    if (settings.notifyProvidersNewBooking) {
      const providerEmail = appt.provider?.user?.email;
      if (providerEmail) recipients.add(providerEmail);
    }

    if (recipients.size === 0) return;

    await this.email.send({
      to: Array.from(recipients),
      subject,
      html,
      text: `Novo agendamento: ${appt.clientName} - ${startLabel} - ${appt.serviceName}`,
    });
  }

  // ---------------------------------------------------------------------------
  // EMAIL: CANCELAMENTO (gestão + provider), respeitando TenantSettings
  // ---------------------------------------------------------------------------
  private async notifyCancellation(tenantId: string, appointmentId: string) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        emailCancellation: true,
        notifyProvidersChanges: true,
        timezone: true,
      },
    });

    if (!settings) return;
    if (!settings.emailCancellation && !settings.notifyProvidersChanges) return;

    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        startAt: true,
        clientName: true,
        clientPhone: true,
        serviceName: true,
        provider: {
          select: { name: true, user: { select: { email: true } } },
        },
        location: { select: { name: true } },
      },
    });

    if (!appt) return;

    const tz = settings.timezone ?? 'Europe/Lisbon';
    const startLabel = this.formatPtDateTime(appt.startAt, tz);

    const subject = `Cancelamento - ${appt.clientName} (${startLabel})`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.4;">
        <h2>Agendamento cancelado</h2>
        <p><b>Data/Hora:</b> ${startLabel}</p>
        <p><b>Cliente:</b> ${appt.clientName}</p>
        <p><b>Telefone:</b> ${appt.clientPhone}</p>
        <p><b>Serviço:</b> ${appt.serviceName}</p>
        <p><b>Profissional:</b> ${appt.provider?.name ?? '-'}</p>
        <p><b>Unidade:</b> ${appt.location?.name ?? '-'}</p>
        <hr />
        <p style="color:#666; font-size: 12px;">Fluxo - Notificação automática</p>
      </div>
    `.trim();

    const recipients = new Set<string>();

    // Gestão (owner/admin/attendant)
    if (settings.emailCancellation) {
      const managers = await this.prisma.user.findMany({
        where: {
          tenantId,
          active: true,
          role: { in: ['owner', 'admin', 'attendant'] as any },
        },
        select: { email: true },
      });

      for (const u of managers) if (u.email) recipients.add(u.email);
    }

    // Provider
    if (settings.notifyProvidersChanges) {
      const providerEmail = appt.provider?.user?.email;
      if (providerEmail) recipients.add(providerEmail);
    }

    if (recipients.size === 0) return;

    await this.email.send({
      to: Array.from(recipients),
      subject,
      html,
      text: `Cancelamento: ${appt.clientName} - ${startLabel} - ${appt.serviceName}`,
    });
  }

  // ---------------------------------------------------------------------------
  // EMAIL: REAGENDAMENTO (gestão + provider), respeitando TenantSettings
  // ---------------------------------------------------------------------------
  private async notifyReschedule(
    tenantId: string,
    appointmentId: string,
    oldStartAt: Date,
  ) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        emailReschedule: true,
        notifyProvidersChanges: true,
        timezone: true,
      },
    });

    if (!settings) return;
    if (!settings.emailReschedule && !settings.notifyProvidersChanges) return;

    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        startAt: true,
        clientName: true,
        clientPhone: true,
        serviceName: true,
        provider: {
          select: { name: true, user: { select: { email: true } } },
        },
        location: { select: { name: true } },
      },
    });

    if (!appt) return;

    const tz = settings.timezone ?? 'Europe/Lisbon';

    const oldLabel = this.formatPtDateTime(oldStartAt, tz);
    const newLabel = this.formatPtDateTime(appt.startAt, tz);

    const subject = `Reagendamento - ${appt.clientName} (${oldLabel} → ${newLabel})`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.4;">
        <h2>Agendamento reagendado</h2>
        <p><b>Antes:</b> ${oldLabel}</p>
        <p><b>Novo:</b> ${newLabel}</p>
        <p><b>Cliente:</b> ${appt.clientName}</p>
        <p><b>Telefone:</b> ${appt.clientPhone}</p>
        <p><b>Serviço:</b> ${appt.serviceName}</p>
        <p><b>Profissional:</b> ${appt.provider?.name ?? '-'}</p>
        <p><b>Unidade:</b> ${appt.location?.name ?? '-'}</p>
        <hr />
        <p style="color:#666; font-size: 12px;">Fluxo - Notificação automática</p>
      </div>
    `.trim();

    const recipients = new Set<string>();

    // Gestão (owner/admin/attendant)
    if (settings.emailReschedule) {
      const managers = await this.prisma.user.findMany({
        where: {
          tenantId,
          active: true,
          role: { in: ['owner', 'admin', 'attendant'] as any },
        },
        select: { email: true },
      });

      for (const u of managers) if (u.email) recipients.add(u.email);
    }

    // Provider
    if (settings.notifyProvidersChanges) {
      const providerEmail = appt.provider?.user?.email;
      if (providerEmail) recipients.add(providerEmail);
    }

    if (recipients.size === 0) return;

    await this.email.send({
      to: Array.from(recipients),
      subject,
      html,
      text: `Reagendamento: ${appt.clientName} - ${oldLabel} -> ${newLabel} - ${appt.serviceName}`,
    });
  }
  // ---------------------------------------------------------------------------
  // PAGAMENTOS MANUAIS (PRESENCIAL/PARCIAL)
  // ---------------------------------------------------------------------------
  async addPayment(
    tenantId: string,
    appointmentId: string,
    actorUserId: string,
    actorRole: Role,
    dto: CreateAppointmentPaymentDto,
  ) {
    // MVP: somente gestão registra pagamento manual
    if (!PAYMENT_MANAGERS.has(actorRole)) {
      throw new ForbiddenException('Sem permissão para registrar pagamentos.');
    }

    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        servicePriceCents: true,
        locationId: true,
        location: {
          select: {
            bookingPaymentPolicy: true,
            bookingDepositPercent: true,
          },
        },
        bookingPayment: {
          select: { status: true, amountCents: true },
        },
        payments: {
          select: { amountCents: true },
        },
      },
    });

    if (!appt) throw new NotFoundException('Appointment não encontrado.');

    if (appt.status === 'cancelled') {
      throw new BadRequestException(
        'Não é possível registrar pagamento em agendamento cancelado.',
      );
    }

    const serviceTotal = appt.servicePriceCents ?? 0;

    const paidOnline =
      appt.bookingPayment?.status === BookingPaymentStatus.succeeded
        ? appt.bookingPayment.amountCents
        : 0;

    const refundedOnline =
      appt.bookingPayment?.status === BookingPaymentStatus.refunded
        ? appt.bookingPayment.amountCents
        : 0;

    const paidManual = (appt.payments ?? []).reduce(
      (sum, p) => sum + (p.amountCents ?? 0),
      0,
    );

    const nextPaid = paidOnline + paidManual + dto.amountCents;

    // regra MVP: não deixa ultrapassar o total do serviço
    if (serviceTotal > 0 && nextPaid > serviceTotal) {
      throw new BadRequestException({
        code: 'PAYMENT_EXCEEDS_TOTAL',
        message:
          'O pagamento ultrapassa o total do serviço. Regista um valor menor ou ajusta o total do serviço.',
        serviceTotal,
        paidOnline,
        paidManual,
        tryingToAdd: dto.amountCents,
        nextPaid,
      });
    }

    await this.prisma.appointmentPayment.create({
      data: {
        tenantId,
        appointmentId,
        amountCents: dto.amountCents,
        method: dto.method,
        recordedById: actorUserId,
        note: dto.note ?? undefined,
      },
    });

    // ✅ Se estava pendente de pagamento e agora atingiu o mínimo exigido, libera (scheduled)
    const policy =
      appt.location?.bookingPaymentPolicy ?? BookingPaymentPolicy.offline_only;
    const depositPercent = Math.max(
      0,
      Math.min(100, appt.location?.bookingDepositPercent ?? 0),
    );

    const total = appt.servicePriceCents ?? 0;

    // mínimo exigido (MVP):
    // - offline_only => 0
    // - online_optional => se depositPercent > 0 exige depósito; senão 0
    // - online_required => se depositPercent > 0 exige depósito; se 0 exige total (100%)
    let requiredCents = 0;

    if (policy === BookingPaymentPolicy.online_optional) {
      requiredCents =
        depositPercent > 0 ? Math.ceil((total * depositPercent) / 100) : 0;
    }

    if (policy === BookingPaymentPolicy.online_required) {
      const effectivePercent = depositPercent > 0 ? depositPercent : 100;
      requiredCents = Math.ceil((total * effectivePercent) / 100);
    }

    // paidOnline/paidManual/nextPaid você já calculou acima:
    if (
      appt.status === AppointmentState.pending_payment &&
      nextPaid >= requiredCents
    ) {
      await this.prisma.appointment.update({
        where: { id: appt.id },
        data: { status: AppointmentState.scheduled },
      });
    }

    return this.getPaymentsSummary(
      tenantId,
      appointmentId,
      actorUserId,
      actorRole,
    );
  }

  async getPaymentsSummary(
    tenantId: string,
    appointmentId: string,
    actorUserId: string,
    actorRole: Role,
  ) {
    // Gestão pode ver tudo do tenant
    const isManager = PAYMENT_MANAGERS.has(actorRole);

    // Provider: só pode ver se o appointment é dele
    const needsOwnershipCheck = actorRole === Role.provider;

    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        providerId: true,
        status: true,
        clientName: true,
        serviceName: true,
        servicePriceCents: true,
        startAt: true,

        provider: {
          select: {
            id: true,
            userId: true, // <- ownership real
          },
        },

        bookingPayment: {
          select: {
            status: true,
            amountCents: true,
            kind: true,
            createdAt: true,
          },
        },

        payments: {
          orderBy: { paidAt: 'asc' },
          select: {
            id: true,
            amountCents: true,
            method: true,
            paidAt: true,
            note: true,
            recordedBy: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!appt) throw new NotFoundException('Appointment não encontrado.');

    // Se for provider, exige que o appointment pertença ao provider logado
    if (needsOwnershipCheck) {
      const apptProviderUserId = appt.provider?.userId;

      if (!apptProviderUserId || apptProviderUserId !== actorUserId) {
        throw new ForbiddenException(
          'Sem permissão para ver pagamentos deste agendamento.',
        );
      }
    }

    // Se não for manager nem provider, nega (defensivo)
    if (!isManager && !needsOwnershipCheck) {
      throw new ForbiddenException('Sem permissão para ver pagamentos.');
    }

    const total = appt.servicePriceCents ?? 0;

    const paidOnline =
      appt.bookingPayment?.status === BookingPaymentStatus.succeeded
        ? appt.bookingPayment.amountCents
        : 0;
    const refundedOnlineCents =
      appt.bookingPayment?.status === BookingPaymentStatus.refunded
        ? appt.bookingPayment.amountCents
        : 0;

    const paidManual = (appt.payments ?? []).reduce(
      (sum, p) => sum + (p.amountCents ?? 0),
      0,
    );

    const paidTotal = paidOnline + paidManual;
    const remaining = Math.max(0, total - paidTotal);

    return {
      appointment: appt,
      summary: {
        totalCents: total,
        paidOnlineCents: paidOnline,
        refundedOnlineCents: refundedOnlineCents,
        paidManualCents: paidManual,
        paidTotalCents: paidTotal,
        remainingCents: remaining,
        isFullyPaid: total > 0 ? paidTotal >= total : false,
      },
    };
  }
  // ---------------------------------------------------------------------------
  // REEMBOLSO (MVP): marca no banco como "refunded" (sem chamar Stripe)
  // Regras MVP:
  // - somente owner/admin
  // - só reembolsa se bookingPayment estiver succeeded
  // - exige appointment CANCELLED (evita reembolso em agenda ativa)
  // ---------------------------------------------------------------------------
  async refundBookingPayment(
    tenantId: string,
    appointmentId: string,
    actorUserId: string,
    actorRole: Role,
    reason?: string,
  ) {
    if (!REFUND_MANAGERS.has(actorRole)) {
      throw new ForbiddenException('Sem permissão para reembolsar pagamentos.');
    }

    return this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        select: {
          id: true,
          status: true,
          bookingPayment: {
            select: {
              id: true,
              status: true,
              refundedAt: true,
              stripePaymentIntentId: true,
              amountCents: true,
            },
          },
        },
      });

      if (!appt) throw new NotFoundException('Appointment não encontrado.');
      if (!appt.bookingPayment?.id) {
        throw new BadRequestException(
          'Este agendamento não possui pagamento online.',
        );
      }

      // Guardrail: exige cancelamento antes de reembolsar (MVP)
      if (appt.status !== AppointmentState.cancelled) {
        throw new BadRequestException({
          code: 'REFUND_REQUIRES_CANCELLED_APPOINTMENT',
          message:
            'Para reembolsar, primeiro cancele o agendamento (status=cancelled).',
          currentStatus: appt.status,
        });
      }
      // ✅ Idempotência: se já foi reembolsado, retorna replay (não é erro)
      if (
        appt.bookingPayment.status === BookingPaymentStatus.refunded ||
        appt.bookingPayment.refundedAt
      ) {
        return {
          replay: true,
          bookingPayment: appt.bookingPayment,
        };
      }

      // Guardrail: só reembolsa se foi pago com sucesso
      if (appt.bookingPayment.status !== BookingPaymentStatus.succeeded) {
        throw new BadRequestException({
          code: 'REFUND_NOT_ALLOWED_FOR_STATUS',
          message:
            'Só é possível reembolsar quando o pagamento está como SUCCEEDED.',
          currentPaymentStatus: appt.bookingPayment.status,
        });
      }

      const pi = appt.bookingPayment.stripePaymentIntentId;
      if (!pi) {
        throw new BadRequestException({
          code: 'MISSING_STRIPE_PAYMENT_INTENT',
          message:
            'Este pagamento não possui stripePaymentIntentId. Confirme se o webhook registrou o payment_intent.',
        });
      }

      const stripe = this.requireStripe();

      await stripe.refunds.create(
        { payment_intent: pi },
        { idempotencyKey: `refund:${appt.bookingPayment.id}` },
      );

      const updated = await tx.bookingPayment.update({
        where: { id: appt.bookingPayment.id },
        data: {
          status: BookingPaymentStatus.refunded,
          refundedAt: new Date(),
          refundReason: reason?.trim() ? reason.trim() : 'stripe_refund',
          refundedById: actorUserId,
        },
      });

      return {
        replay: false,
        bookingPayment: updated,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Cancelar + reembolsar (fluxo único)
  // - cancela o appointment (status=cancelled)
  // - faz refund na Stripe (e marca BookingPayment como refunded)
  // Regras:
  // - somente owner/admin
  // - só reembolsa se bookingPayment.status = succeeded
  // - refund exige appointment CANCELLED (refundBookingPayment já valida isso)
  // ---------------------------------------------------------------------------
  async cancelAndRefund(
    tenantId: string,
    appointmentId: string,
    actorUserId: string,
    actorRole: Role,
    reason?: string,
  ) {
    // 0) Idempotência: se já estiver reembolsado, não tenta reembolsar de novo
    const current = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        status: true,
        bookingPayment: {
          select: { id: true, status: true, refundedAt: true },
        },
      },
    });

    if (!current) throw new NotFoundException('Appointment não encontrado.');

    // Se já está reembolsado, só garante cancelamento e retorna replay
    if (current.bookingPayment?.status === BookingPaymentStatus.refunded) {
      if (current.status !== AppointmentState.cancelled) {
        const cancelled = await this.remove(
          tenantId,
          appointmentId,
          actorUserId,
          actorRole,
        );
        return {
          replay: true,
          appointment: cancelled,
          bookingPayment: current.bookingPayment,
        };
      }

      return {
        replay: true,
        appointment: current,
        bookingPayment: current.bookingPayment,
      };
    }

    // 1) Permissão (defensivo)
    if (!REFUND_MANAGERS.has(actorRole)) {
      throw new ForbiddenException('Sem permissão para cancelar e reembolsar.');
    }

    // 2) Cancela
    const cancelledAppointment = await this.remove(
      tenantId,
      appointmentId,
      actorUserId,
      actorRole,
    );

    // 3) Reembolsa
    const refundedBookingPayment = await this.refundBookingPayment(
      tenantId,
      appointmentId,
      actorUserId,
      actorRole,
      reason,
    );

    return {
      appointment: cancelledAppointment,
      bookingPayment: refundedBookingPayment,
    };
  }
}
