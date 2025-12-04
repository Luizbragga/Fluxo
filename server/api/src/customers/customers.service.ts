import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async listAll(tenantId: string) {
    const normalizePhone = (phone: string) => phone.replace(/\D+/g, '');

    // 1) Buscar agendamentos e planos em paralelo
    const [appointments, plans] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { tenantId },
        select: {
          id: true,
          clientName: true,
          clientPhone: true,
          startAt: true,
          status: true,
          serviceName: true,
          servicePriceCents: true,
          customerId: true,
          customerPlanId: true,
          provider: {
            select: { name: true },
          },
        },
        orderBy: { startAt: 'asc' },
      }),

      this.prisma.customerPlan.findMany({
        where: { tenantId },
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          status: true,
          currentCycleEnd: true,
          visitsUsedInCycle: true,
          planTemplate: {
            select: {
              name: true,
              visitsPerInterval: true,
            },
          },
        },
      }),
    ]);

    // ----------------------------------------------------------------
    // 2) Construir o "mapa" de clientes (mesma ideia que você já tinha)
    // ----------------------------------------------------------------
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

    // Agendamentos → alimentam nome, telefone, total de visitas, última/próxima visita
    for (const appt of appointments) {
      if (!appt.clientPhone) continue;

      const key = normalizePhone(appt.clientPhone);
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

        if (appt.status === 'done') {
          existing.lastVisitDate = formattedDate;
        }

        if (appt.status === 'scheduled') {
          existing.nextVisitDate = formattedDate;
        }
      }
    }

    // Planos → ligam info de plano a esse mesmo mapa (por telefone)
    for (const plan of plans) {
      const key = normalizePhone(plan.customerPhone);
      const existing = customersMap.get(key);

      const formattedRenewal = plan.currentCycleEnd.toLocaleDateString(
        'pt-PT',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        },
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

    // Array final de clientes (ordenado por nome)
    const customers = Array.from(customersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-PT'),
    );

    // ----------------------------------------------------------------
    // 3) "plans" no formato que o front novo espera
    // ----------------------------------------------------------------
    const plansView = plans.map((p) => {
      const customerId = normalizePhone(p.customerPhone);

      return {
        id: p.id,
        customerId,
        planName: p.planTemplate.name,
        status: p.status, // "active" | "suspended" | "late" | "cancelled"
        visitsUsed: p.visitsUsedInCycle,
        visitsTotal: p.planTemplate.visitsPerInterval ?? 0,
        renewsAt: p.currentCycleEnd.toLocaleDateString('pt-PT', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        nextChargeAmount: null as number | null, // ligamos depois com pagamentos reais
      };
    });

    // ----------------------------------------------------------------
    // 4) Histórico de visitas por cliente (para o modal financeiro)
    // ----------------------------------------------------------------
    const history = appointments
      .map((appt) => {
        const baseCustomerId =
          appt.customerId ??
          (appt.clientPhone ? normalizePhone(appt.clientPhone) : null);

        if (!baseCustomerId) {
          // sem cliente identificável, ignora no histórico
          return null;
        }

        const date = new Date(appt.startAt);

        const formattedDate = date.toLocaleDateString('pt-PT', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        const formattedTime = date.toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const priceCents = appt.servicePriceCents ?? 0;
        const price = priceCents / 100;

        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1; // 1-12

        const source =
          appt.customerPlanId !== null
            ? ('plan' as const)
            : ('single' as const);

        return {
          id: appt.id,
          customerId: baseCustomerId,
          date: formattedDate,
          time: formattedTime,
          professionalName: appt.provider?.name ?? '',
          serviceName: appt.serviceName ?? '',
          source,
          status: appt.status as 'done' | 'no_show' | 'cancelled' | any,
          price,
          year,
          month,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // ----------------------------------------------------------------
    // 5) Retorno no formato que o owner-customers.ts novo espera
    // ----------------------------------------------------------------
    return {
      customers,
      plans: plansView,
      history,
    };
  }
}
