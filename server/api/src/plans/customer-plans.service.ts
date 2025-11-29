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
      const newCycleStart = plan.currentCycleEnd;

      const hasAdvancePayment = plan.payments.some(
        (payment) =>
          payment.status === CustomerPlanPaymentStatus.paid &&
          payment.dueDate >= newCycleStart,
      );

      return {
        ...plan,
        canRegisterPayment: !hasAdvancePayment, // se já tem pagamento adiantado, não pode registrar de novo
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

    const newCycleStart = plan.currentCycleEnd;

    const hasAdvancePayment = plan.payments.some(
      (payment) =>
        payment.status === CustomerPlanPaymentStatus.paid &&
        payment.dueDate >= newCycleStart,
    );

    return {
      ...plan,
      canRegisterPayment: !hasAdvancePayment,
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
  // ---------------------------------------------------------------------------
  // REGISTAR PAGAMENTO DO PLANO (renovação usada pelo owner)
  // ---------------------------------------------------------------------------
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
      const now = new Date();
      const maxAllowedEnd = addMonthsCalendar(now, 1);

      if (plan.currentCycleEnd > maxAllowedEnd) {
        throw new BadRequestException(
          'Já existe um pagamento adiantado para o próximo ciclo. ' +
            'Só é possível adiantar um mês de cada vez.',
        );
      }
      // 2) Data em que o dinheiro entrou
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      if (Number.isNaN(paidAt.getTime())) {
        throw new BadRequestException('Data de pagamento (paidAt) inválida.');
      }

      if (!dto.amountCents || dto.amountCents <= 0) {
        throw new BadRequestException('amountCents deve ser maior que zero.');
      }

      // 3) Calcula o novo ciclo:
      //    - Base = fim do ciclo atual (plan.currentCycleEnd)
      //    - Novo ciclo começa quando o anterior termina
      //    - Novo ciclo termina no "mesmo dia" do mês seguinte (regra de calendário)
      const previousCycleEnd = plan.currentCycleEnd;
      const newCycleStart = previousCycleEnd;
      const newCycleEnd = addMonthsCalendar(previousCycleEnd, 1);

      // 4) Cria o registro de pagamento deste novo ciclo
      await tx.customerPlanPayment.create({
        data: {
          tenantId,
          customerPlanId: plan.id,
          // dueDate = fim do ciclo que está a ser pago
          dueDate: newCycleEnd,
          amountCents: dto.amountCents,
          status: CustomerPlanPaymentStatus.paid,
          paidAt,
        },
      });

      // 5) Atualiza o plano
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
