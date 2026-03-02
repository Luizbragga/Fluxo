// src/plans/customer-plans.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerPlanDto } from './dto/create-customer-plan.dto';
import { UpdateCustomerPlanDto } from './dto/update-customer-plan.dto';
import { RegisterCustomerPlanPaymentDto } from './dto/register-customer-plan-payment.dto';
import { CustomerPlanStatus, CustomerPlanPaymentStatus } from '@prisma/client';

const PAY_NEXT_CYCLE_WINDOW_DAYS = 30;
@Injectable()
export class CustomerPlansService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------
  async create(tenantId: string, dto: CreateCustomerPlanDto) {
    // 1) Garantir que o template existe e é do tenant
    const template = await this.prisma.planTemplate.findFirst({
      where: {
        id: dto.planTemplateId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        intervalDays: true,
        locationId: true,
        priceCents: true,
      },
    });

    if (!template) {
      throw new BadRequestException('PlanTemplate inválido para este tenant.');
    }

    // 2) Definir o primeiro ciclo do plano:
    //    - início = agora
    //    - fim    = mesmo dia do mês seguinte (ajustado p/ fim do mês quando precisar)
    const now = new Date();
    const currentCycleStart = now;
    const currentCycleEnd = addMonthsCalendar(now, 1);

    // 3) Consideramos que, ao criar o plano, o primeiro mês já é pago
    const firstDueDate = currentCycleEnd;
    const firstPaidAt = now;

    // 4) Criar CustomerPlan + primeiro pagamento PAGO dentro de transação
    const customerPlan = await this.prisma.$transaction(async (tx) => {
      const createdPlan = await tx.customerPlan.create({
        data: {
          tenantId,
          planTemplateId: dto.planTemplateId,
          locationId: template.locationId, // mesma unidade do template

          customerName: dto.customerName,
          customerPhone: dto.customerPhone,

          status: dto.status ?? CustomerPlanStatus.active,

          currentCycleStart,
          currentCycleEnd,

          lastPaymentStatus: CustomerPlanPaymentStatus.paid,
          lastPaymentAt: firstPaidAt,

          // começamos o ciclo com 0 visitas usadas
          visitsUsedInCycle: 0,
        },
      });

      // primeiro pagamento já como "paid"
      await tx.customerPlanPayment.create({
        data: {
          tenantId,
          customerPlanId: createdPlan.id,
          // dueDate = fim do primeiro ciclo
          dueDate: firstDueDate,
          amountCents: template.priceCents,
          status: CustomerPlanPaymentStatus.paid,
          paidAt: firstPaidAt,
        },
      });

      return createdPlan;
    });

    // 5) Retorna já com template e location
    return this.prisma.customerPlan.findUnique({
      where: { id: customerPlan.id },
      include: {
        planTemplate: true,
        location: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // LISTAR TODOS (por tenant/location)
  // ---------------------------------------------------------------------------
  async findAll(tenantId: string, locationId?: string) {
    const plans = await this.prisma.customerPlan.findMany({
      where: {
        tenantId,
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        planTemplate: true,
        location: true,
        payments: true, // precisamos ver os pagamentos para saber se já tem mês adiantado
      },
    });

    return plans.map((plan) => {
      const nextCycleStart = plan.currentCycleEnd;

      const paidPayments = plan.payments.filter(
        (p) => p.status === CustomerPlanPaymentStatus.paid,
      );

      const paidThrough = paidPayments.reduce<Date | null>((max, p) => {
        if (!max) return p.dueDate;
        return p.dueDate > max ? p.dueDate : max;
      }, null);

      // Se já existe um pagamento cobrindo o próximo ciclo, não faz sentido "pagar próximo mês" de novo
      const hasPaymentCoveringNextCycle = paidPayments.some(
        (p) => p.dueDate > nextCycleStart,
      );

      const inWindow = canPayNextCycleNow(
        plan.currentCycleEnd,
        PAY_NEXT_CYCLE_WINDOW_DAYS,
      );
      const canPayNextCycle = inWindow && !hasPaymentCoveringNextCycle;

      return {
        ...plan,
        // compat temporária pro front não quebrar:
        canRegisterPayment: canPayNextCycle,
        // novo nome mais claro (você pode migrar o front depois):
        canPayNextCycle,
        // até quando está pago (maior dueDate pago)
        paidThrough,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // DETALHE – trazendo últimos pagamentos
  // ---------------------------------------------------------------------------
  async findOne(tenantId: string, id: string) {
    const plan = await this.prisma.customerPlan.findFirst({
      where: { id, tenantId },
      include: {
        planTemplate: true,
        location: true,
        payments: {
          orderBy: { dueDate: 'desc' },
          take: 12,
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('CustomerPlan não encontrado no tenant.');
    }

    const nextCycleStart = plan.currentCycleEnd;

    const paidPayments = plan.payments.filter(
      (p) => p.status === CustomerPlanPaymentStatus.paid,
    );

    const paidThrough = paidPayments.reduce<Date | null>((max, p) => {
      if (!max) return p.dueDate;
      return p.dueDate > max ? p.dueDate : max;
    }, null);

    const hasPaymentCoveringNextCycle = paidPayments.some(
      (p) => p.dueDate > nextCycleStart,
    );

    const inWindow = canPayNextCycleNow(
      plan.currentCycleEnd,
      PAY_NEXT_CYCLE_WINDOW_DAYS,
    );
    const canPayNextCycle = inWindow && !hasPaymentCoveringNextCycle;

    return {
      ...plan,
      // compat temporária:
      canRegisterPayment: canPayNextCycle,
      // novo:
      canPayNextCycle,
      paidThrough,
    };
  }

  // ---------------------------------------------------------------------------
  // UPDATE básico – nome, telefone, status
  // ---------------------------------------------------------------------------
  async update(tenantId: string, id: string, dto: UpdateCustomerPlanDto) {
    const exists = await this.prisma.customerPlan.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('CustomerPlan não encontrado no tenant.');
    }

    return this.prisma.customerPlan.update({
      where: { id },
      data: {
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        status: dto.status,
      },
      include: {
        planTemplate: true,
        location: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // REGISTAR PAGAMENTO DO PLANO (renovação usada pelo owner)
  // ---------------------------------------------------------------------------
  async registerPayment(
    tenantId: string,
    id: string,
    dto: RegisterCustomerPlanPaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1) Busca o plano do cliente dentro do tenant
      const plan = await tx.customerPlan.findFirst({
        where: { id, tenantId },
        include: {
          planTemplate: {
            select: {
              priceCents: true,
            },
          },
        },
      });

      if (!plan) {
        throw new NotFoundException('CustomerPlan não encontrado no tenant.');
      }

      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      if (Number.isNaN(paidAt.getTime())) {
        throw new BadRequestException('Data de pagamento (paidAt) inválida.');
      }

      if (!dto.amountCents || dto.amountCents <= 0) {
        throw new BadRequestException('amountCents deve ser maior que zero.');
      }

      const months = dto.months ?? 1;
      if (months === 1) {
        const allowed = canPayNextCycleNow(
          plan.currentCycleEnd,
          PAY_NEXT_CYCLE_WINDOW_DAYS,
        );
        if (!allowed) {
          throw new BadRequestException(
            `Ainda não é possível pagar o próximo mês. Só fica disponível nos últimos ${PAY_NEXT_CYCLE_WINDOW_DAYS} dias antes do vencimento.`,
          );
        }
      }
      const previousCycleEnd = plan.currentCycleEnd;
      let newCycleStart = previousCycleEnd;
      let newCycleEnd = previousCycleEnd;

      // cria N pagamentos e avança o ciclo N vezes
      for (let i = 0; i < months; i++) {
        newCycleEnd = addMonthsCalendar(newCycleEnd, 1);

        await tx.customerPlanPayment.create({
          data: {
            tenantId,
            customerPlanId: plan.id,
            dueDate: newCycleEnd,
            amountCents: dto.amountCents,
            status: CustomerPlanPaymentStatus.paid,
            paidAt,
          },
        });
      }

      const updated = await tx.customerPlan.update({
        where: { id: plan.id },
        data: {
          status: CustomerPlanStatus.active,
          lastPaymentStatus: CustomerPlanPaymentStatus.paid,
          lastPaymentAt: paidAt,
          currentCycleStart: newCycleStart,
          currentCycleEnd: newCycleEnd,
          visitsUsedInCycle: 0,
        },
        include: {
          planTemplate: true,
          location: true,
        },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // RESTAURAR 1 VISITA DE UM AGENDAMENTO (quando o owner decide devolver)
  // ---------------------------------------------------------------------------
  async restoreVisitFromAppointment(tenantId: string, appointmentId: string) {
    // 1) Busca o agendamento com o plano associado
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
      },
      select: {
        id: true,
        startAt: true,
        customerPlanId: true,
      },
    });

    // se não tem agendamento ou não está ligado a um plano, não há o que fazer
    if (!appointment || !appointment.customerPlanId) {
      return;
    }

    // 2) Busca o plano para garantir que existe e pegar o ciclo atual
    const plan = await this.prisma.customerPlan.findFirst({
      where: {
        id: appointment.customerPlanId,
        tenantId,
      },
      select: {
        id: true,
        currentCycleStart: true,
        currentCycleEnd: true,
        visitsUsedInCycle: true,
      },
    });

    if (!plan) {
      return;
    }

    // 3) Só restaura se o atendimento estiver dentro do ciclo atual
    const startAt = appointment.startAt;

    if (
      !startAt ||
      startAt < plan.currentCycleStart ||
      startAt >= plan.currentCycleEnd
    ) {
      // atendimento fora do ciclo atual → não mexe na contagem
      return;
    }

    // 4) Se não há visitas usadas, não há o que restaurar
    if (!plan.visitsUsedInCycle || plan.visitsUsedInCycle <= 0) {
      return;
    }

    // 5) Devolve 1 visita ao plano
    await this.prisma.customerPlan.update({
      where: { id: plan.id },
      data: {
        visitsUsedInCycle: {
          decrement: 1,
        },
      },
    });
  }
}
function canPayNextCycleNow(
  currentCycleEnd: Date,
  windowDays: number,
): boolean {
  const now = new Date();

  const windowStart = new Date(currentCycleEnd);
  windowStart.setDate(windowStart.getDate() - windowDays);

  return now >= windowStart;
}
// Soma `months` meses a uma data, tentando manter o mesmo dia.
// Se o mês de destino não tiver esse dia (ex.: 31/01 + 1 mês), usa o último dia do mês.
function addMonthsCalendar(base: Date, months: number): Date {
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  // último dia do mês alvo
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const finalDay = Math.min(day, lastDay);

  return new Date(
    targetYear,
    targetMonth,
    finalDay,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  );
}
