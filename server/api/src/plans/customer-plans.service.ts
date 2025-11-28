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

    // 2) Definir o primeiro ciclo do plano (agora -> agora + intervalDays)
    const now = new Date();
    const currentCycleStart = now;
    const currentCycleEnd = new Date(
      now.getTime() + template.intervalDays * 24 * 60 * 60 * 1000,
    );

    // 3) Vencimento da 1ª cobrança = fim do ciclo (sem 8 dias de tolerância)
    const firstDueDate = currentCycleEnd;

    // 4) Criar CustomerPlan + primeira cobrança dentro de transação
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

          // pagamento ainda não realizado
          lastPaymentStatus: CustomerPlanPaymentStatus.pending,
        },
      });

      // primeira cobrança pendente para este plano
      await tx.customerPlanPayment.create({
        data: {
          tenantId,
          customerPlanId: createdPlan.id,
          dueDate: firstDueDate,
          amountCents: template.priceCents,
          status: CustomerPlanPaymentStatus.pending,
          // paidAt fica null
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
    return this.prisma.customerPlan.findMany({
      where: {
        tenantId,
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        planTemplate: true,
        location: true,
      },
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

    return plan;
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
  // REGISTAR PAGAMENTO DO PLANO (usado pelo owner)
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
              intervalDays: true,
            },
          },
        },
      });

      if (!plan) {
        throw new NotFoundException('CustomerPlan não encontrado no tenant.');
      }

      // 2) Define data do pagamento
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      if (Number.isNaN(paidAt.getTime())) {
        throw new BadRequestException('Data de pagamento (paidAt) inválida.');
      }

      if (!dto.amountCents || dto.amountCents <= 0) {
        throw new BadRequestException('amountCents deve ser maior que zero.');
      }

      // 3) Cria o registro de pagamento (CustomerPlanPayment)
      await tx.customerPlanPayment.create({
        data: {
          tenantId,
          customerPlanId: plan.id,
          // usamos o fim do ciclo atual como "dueDate" da fatura
          dueDate: plan.currentCycleEnd,
          amountCents: dto.amountCents,
          status: CustomerPlanPaymentStatus.paid,
          paidAt,
        },
      });

      // 4) Calcula o novo ciclo do plano
      const intervalDays = plan.planTemplate.intervalDays || 30;

      const newCycleStart = paidAt;
      const newCycleEnd = new Date(
        paidAt.getTime() + intervalDays * 24 * 60 * 60 * 1000,
      );

      // 5) Atualiza o plano:
      //    - volta para ACTIVE
      //    - marca lastPaymentStatus como PAID
      //    - reseta visitas do ciclo
      const updated = await tx.customerPlan.update({
        where: { id: plan.id },
        data: {
          status: CustomerPlanStatus.active,
          lastPaymentStatus: CustomerPlanPaymentStatus.paid,
          currentCycleStart: newCycleStart,
          currentCycleEnd: newCycleEnd,
          visitsUsedInCycle: 0,
          // carryOverVisits mantemos como está por enquanto
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
