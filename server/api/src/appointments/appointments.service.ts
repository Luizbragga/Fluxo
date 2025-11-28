import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { addMinutes, isBefore } from 'date-fns';
import { AppointmentStateEnum } from './dto/update-status.dto';
import {
  Prisma,
  CustomerPlanStatus,
  CustomerPlanPaymentStatus,
} from '@prisma/client';

const DEFAULT_COMMISSION_PERCENTAGE = 50; // 50% por padrão (ajustável depois)

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateAppointmentDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (isBefore(endAt, startAt)) {
      throw new BadRequestException('endAt deve ser após startAt.');
    }

    // validar provider pertence ao tenant e tem locationId
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

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service || service.tenantId !== tenantId) {
      throw new ForbiddenException('Service inválido para este tenant.');
    }

    // ----------------------------------------------------------------
    // LÓGICA DE PLANO DO CLIENTE (CustomerPlan)
    // ----------------------------------------------------------------
    let customerPlanId: string | null = null;

    if (dto.customerPlanId) {
      const customerPlan = await this.prisma.customerPlan.findFirst({
        where: {
          id: dto.customerPlanId,
          tenantId,
          status: CustomerPlanStatus.active, // só planos ativos
          OR: [
            { locationId: provider.locationId }, // plano daquela filial
            { locationId: null }, // ou plano global
          ],
        },
        include: {
          planTemplate: true,
        },
      });

      if (!customerPlan) {
        throw new BadRequestException(
          'Plano do cliente inválido para este tenant/local ou não está ativo.',
        );
      }

      // ----------------------------------------------------------------
      // PAGAMENTO / VENCIMENTO
      // Regra: venceu o ciclo, não usa mais até pagar.
      // Nada de período de tolerância para USO.
      // ----------------------------------------------------------------
      if (startAt > customerPlan.currentCycleEnd) {
        // marca plano como atrasado e pagamento como atrasado
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

      // garantir que a data do agendamento está dentro do ciclo atual
      if (
        startAt < customerPlan.currentCycleStart ||
        startAt > customerPlan.currentCycleEnd
      ) {
        throw new BadRequestException(
          'Data do agendamento está fora do ciclo atual do plano do cliente.',
        );
      }

      // limite de visitas neste ciclo = visitas do template + carry-over
      const visitsLimit =
        customerPlan.planTemplate.visitsPerInterval +
        customerPlan.carryOverVisits;

      const nextVisitsUsed = customerPlan.visitsUsedInCycle + 1;

      if (nextVisitsUsed > visitsLimit) {
        throw new BadRequestException(
          'Cliente já utilizou todas as visitas disponíveis neste ciclo do plano.',
        );
      }

      // atualiza contador de visitas usadas
      await this.prisma.customerPlan.update({
        where: { id: customerPlan.id },
        data: {
          visitsUsedInCycle: nextVisitsUsed,
        },
      });

      customerPlanId = customerPlan.id;
    }

    // ----------------------------------------------------------------
    // CONFLITO COM BLOCKS
    // ----------------------------------------------------------------
    const hasBlockConflict = await this.prisma.block.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (hasBlockConflict) {
      throw new BadRequestException('Conflito com bloqueio de agenda.');
    }

    // ----------------------------------------------------------------
    // CONFLITO COM OUTROS APPOINTMENTS (ignora cancelados)
    // ----------------------------------------------------------------
    const hasApptConflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        status: { not: 'cancelled' as any },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (hasApptConflict) {
      throw new BadRequestException('Conflito com outro agendamento.');
    }

    // força duração pelo service.durationMin
    const expectedEnd = addMinutes(startAt, service.durationMin);
    if (expectedEnd.getTime() !== endAt.getTime()) {
      throw new BadRequestException(
        `Duração deve ser ${service.durationMin} minutos.`,
      );
    }

    // cria já com os campos denormalizados do serviço + locationId do provider
    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        providerId: dto.providerId,
        locationId: provider.locationId,
        serviceId: dto.serviceId,
        startAt,
        endAt,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        createdById: userId,

        serviceName: service.name,
        serviceDurationMin: service.durationMin,
        servicePriceCents: service.priceCents,

        customerPlanId,
      },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    // ------------------------------------------------------------------
    // Criar o AppointmentEarning com base nas regras de comissão
    // ------------------------------------------------------------------
    const commissionRule = await this.prisma.providerCommission.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        active: true,
        OR: [
          { serviceId: dto.serviceId }, // regra específica do serviço
          { serviceId: null }, // regra padrão do profissional
        ],
      },
      // se existir uma regra específica de serviço, ela vem antes
      orderBy: {
        serviceId: 'desc',
      },
    });

    const commissionPercentage = commissionRule?.percentage ?? 0;

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
        // payoutStatus fica como "pending" pelo default do schema
      },
    });

    return appointment;
  }

  // LISTA DO DIA ---------------------------------------------------------------
  async findByDay(tenantId: string, dateYYYYMMDD: string, providerId?: string) {
    const [yStr, mStr, dStr] = dateYYYYMMDD.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);

    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        startAt: { gte: start },
        endAt: { lte: end },
        ...(providerId ? { providerId } : {}),
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        include: {
          service: { select: { id: true, durationMin: true } },
          provider: { select: { id: true } },
        },
      });

      if (!current) {
        throw new NotFoundException('Appointment não encontrado no tenant');
      }

      const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
      const endAt = dto.endAt
        ? new Date(dto.endAt)
        : new Date(startAt.getTime() + current.service.durationMin * 60_000);

      if (isNaN(startAt.getTime())) {
        throw new BadRequestException('startAt inválido');
      }
      if (isNaN(endAt.getTime())) {
        throw new BadRequestException('endAt inválido');
      }
      if (endAt <= startAt) {
        throw new BadRequestException('endAt deve ser maior que startAt');
      }

      // 🔒 SE TEM PLANO, GARANTIR QUE A NOVA DATA ESTÁ DENTRO DO CICLO ATUAL
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

        if (!customerPlan) {
          throw new BadRequestException(
            'Plano do cliente não está mais ativo para reagendar este agendamento.',
          );
        }

        if (customerPlan.status !== CustomerPlanStatus.active) {
          throw new BadRequestException(
            'Plano do cliente não está mais ativo para reagendar este agendamento.',
          );
        }

        // se nova data for depois do fim do ciclo, bloqueia e marca como atrasado
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

      // conflito com OUTROS appointments (ignora cancelados e o próprio)
      const overlapAppointment = await tx.appointment.findFirst({
        where: {
          tenantId,
          providerId: current.providerId,
          id: { not: current.id },
          status: { not: 'cancelled' as any },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });

      if (overlapAppointment) {
        throw new BadRequestException(
          'Conflito com outro appointment no intervalo solicitado',
        );
      }

      // conflito com BLOCKS
      const overlapBlock = await tx.block.findFirst({
        where: {
          tenantId,
          providerId: current.providerId,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });

      if (overlapBlock) {
        throw new BadRequestException(
          'Conflito com um block do provider no intervalo solicitado',
        );
      }

      return tx.appointment.update({
        where: { id: current.id },
        data: { startAt, endAt },
        include: {
          service: { select: { id: true, name: true, durationMin: true } },
          provider: { select: { id: true, name: true } },
        },
      });
    });
  }

  // ATUALIZAR STATUS -----------------------------------------------------------
  async updateStatus(
    tenantId: string,
    appointmentId: string,
    status: AppointmentStateEnum,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1) Buscar o appointment no tenant com os dados necessários
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
          provider: { select: { id: true, name: true } },
        },
      });

      if (!found) {
        throw new NotFoundException('Appointment não encontrado no tenant');
      }
      // se já está concluído, não permitimos alterar para outro status
      if (
        found.status === AppointmentStateEnum.done &&
        status !== AppointmentStateEnum.done
      ) {
        throw new BadRequestException(
          'Appointments concluídos não podem ter o status alterado.',
        );
      }

      // 2) Atualizar status
      const updated = await tx.appointment.update({
        where: { id: found.id },
        data: { status },
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

      // 3) Se o status virou DONE, gerar earning se ainda não existir
      if (status === AppointmentStateEnum.done) {
        const existing = await tx.appointmentEarning.findUnique({
          where: { appointmentId: updated.id },
        });

        // Evitar duplicar registro financeiro
        if (!existing) {
          const commissionPercentage = await this.getCommissionPercentage(
            tx,
            tenantId,
            updated.providerId,
            updated.serviceId,
          );

          // Preferido o valor denormalizado do appointment
          const servicePriceCents =
            updated.servicePriceCents ?? (updated.service as any).priceCents;

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
  async remove(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          status: true,
          customerPlanId: true,
        },
      });

      if (!appt) {
        throw new NotFoundException('Appointment não encontrado no tenant');
      }

      // não permitir cancelar se já estiver concluído
      if (appt.status === AppointmentStateEnum.done) {
        throw new BadRequestException(
          'Appointments concluídos não podem ser cancelados. Faça um ajuste financeiro manual se necessário.',
        );
      }

      // se já está cancelado, apenas retorna o registro completo
      if (appt.status === AppointmentStateEnum.cancelled) {
        return tx.appointment.findUnique({
          where: { id },
          include: {
            service: { select: { id: true, name: true, durationMin: true } },
            provider: { select: { id: true, name: true } },
          },
        });
      }

      // 1) Se usou plano, devolve 1 visita ao ciclo atual
      if (appt.customerPlanId) {
        const plan = await tx.customerPlan.findUnique({
          where: { id: appt.customerPlanId },
          select: { id: true, visitsUsedInCycle: true },
        });

        if (plan && plan.visitsUsedInCycle > 0) {
          await tx.customerPlan.update({
            where: { id: plan.id },
            data: {
              visitsUsedInCycle: plan.visitsUsedInCycle - 1,
            },
          });
        }
      }

      // 2) Remove qualquer lançamento financeiro ligado a esse appointment
      await tx.appointmentEarning.deleteMany({
        where: { appointmentId: appt.id },
      });

      // 3) Marca o appointment como cancelado e retorna
      return tx.appointment.update({
        where: { id },
        data: { status: AppointmentStateEnum.cancelled as any },
        include: {
          service: { select: { id: true, name: true, durationMin: true } },
          provider: { select: { id: true, name: true } },
        },
      });
    });
  }

  // DEBUG HELPERS --------------------------------------------------------------
  findAll() {
    return this.prisma.appointment.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  findOne(id: string) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  // legado opcional — lista do dia por provider
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
    // 1) Regra específica por serviço
    const serviceRule = await tx.providerCommission.findFirst({
      where: {
        tenantId,
        providerId,
        serviceId,
        active: true,
      },
    });

    if (serviceRule) {
      return serviceRule.percentage;
    }

    // 2) Regra padrão do provider (serviceId = null)
    const defaultRule = await tx.providerCommission.findFirst({
      where: {
        tenantId,
        providerId,
        serviceId: null,
        active: true,
      },
    });

    if (defaultRule) {
      return defaultRule.percentage;
    }

    // 3) Fallback: valor padrão global (por enquanto hard-coded)
    return DEFAULT_COMMISSION_PERCENTAGE;
  }
}
