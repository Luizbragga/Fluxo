import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerPlanDto } from './dto/create-customer-plan.dto';
import { UpdateCustomerPlanDto } from './dto/update-customer-plan.dto';
import { CustomerPlanStatus } from '@prisma/client';

@Injectable()
export class CustomerPlansService {
  constructor(private prisma: PrismaService) {}

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

    // 3) Criar o plano do cliente
    return this.prisma.customerPlan.create({
      data: {
        tenantId,
        planTemplateId: dto.planTemplateId,
        // usamos a mesma location do template
        locationId: template.locationId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        status: dto.status ?? CustomerPlanStatus.active,

        currentCycleStart,
        currentCycleEnd,
        // visitsUsedInCycle, carryOverVisits, lastPaymentStatus
        // já têm default no schema
      },
      include: {
        planTemplate: true,
        location: true,
      },
    });
  }

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

  async findOne(tenantId: string, id: string) {
    const plan = await this.prisma.customerPlan.findFirst({
      where: { id, tenantId },
      include: {
        planTemplate: true,
        location: true,
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 12, // últimos pagamentos (por enquanto)
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('CustomerPlan não encontrado no tenant.');
    }

    return plan;
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerPlanDto) {
    const exists = await this.prisma.customerPlan.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('CustomerPlan não encontrado no tenant.');
    }

    // Por enquanto deixamos só dados básicos atualizáveis.
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
}
