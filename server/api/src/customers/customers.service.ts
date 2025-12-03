import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async listAll(tenantId: string) {
    // Busca todos os agendamentos do tenant
    const appointments = await this.prisma.appointment.findMany({
      where: { tenantId },
      select: {
        clientName: true,
        clientPhone: true,
        startAt: true,
        status: true,
        serviceName: true,
      },
    });

    // Busca todos os planos do tenant
    const plans = await this.prisma.customerPlan.findMany({
      where: { tenantId },
      select: {
        customerName: true,
        customerPhone: true,
        status: true,
        planTemplate: {
          select: { name: true },
        },
        currentCycleEnd: true,
        visitsUsedInCycle: true,
        carryOverVisits: true,
        lastPaymentStatus: true,
        lastPaymentAt: true,
      },
    });

    // Mapa intermediário por telefone
    const customersMap = new Map<
      string,
      {
        name: string;
        phone: string;
        hasActivePlan: boolean;
        planName?: string;
        lastVisitDate?: string;
        nextVisitDate?: string;
        totalVisits: number;
      }
    >();

    // Agendamentos
    for (const appt of appointments) {
      if (!appt.clientPhone) continue;
      const key = appt.clientPhone.replace(/\D+/g, '');
      const existing = customersMap.get(key);

      const date = new Date(appt.startAt);
      const formattedDate = date.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      if (!existing) {
        customersMap.set(key, {
          name: appt.clientName ?? 'Cliente',
          phone: appt.clientPhone,
          hasActivePlan: false,
          totalVisits: 1,
          lastVisitDate: appt.status === 'done' ? formattedDate : undefined,
          nextVisitDate:
            appt.status === 'scheduled' ? formattedDate : undefined,
        });
      } else {
        existing.totalVisits += 1;
        if (appt.status === 'done') existing.lastVisitDate = formattedDate;
        if (appt.status === 'scheduled') existing.nextVisitDate = formattedDate;
      }
    }

    // Planos
    for (const plan of plans) {
      const key = plan.customerPhone.replace(/\D+/g, '');
      const existing = customersMap.get(key);
      const formattedRenewal = plan.currentCycleEnd.toLocaleDateString(
        'pt-PT',
        { day: '2-digit', month: 'short', year: 'numeric' },
      );

      if (!existing) {
        customersMap.set(key, {
          name: plan.customerName,
          phone: plan.customerPhone,
          hasActivePlan: plan.status === 'active',
          planName: plan.planTemplate.name,
          totalVisits: plan.visitsUsedInCycle,
          nextVisitDate: formattedRenewal,
        });
      } else {
        existing.hasActivePlan = plan.status === 'active';
        existing.planName = plan.planTemplate.name;
        existing.nextVisitDate = formattedRenewal;
      }
    }

    // Retorna em formato de array ordenado por nome
    const customers = Array.from(customersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-PT'),
    );

    return { customers };
  }
}
