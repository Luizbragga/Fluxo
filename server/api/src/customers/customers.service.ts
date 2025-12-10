import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async listAll(tenantId: string) {
    const normalizePhone = (phone: string | null | undefined) =>
      phone ? phone.replace(/\D+/g, '') : '';

    // 1) Buscar agendamentos, planos e clientes REAIS em paralelo
    const [appointments, plans, customersDb] = await Promise.all([
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

      this.prisma.customer.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
        },
      }),
    ]);

    // Mapa telefone normalizado -> Customer real do banco
    const phoneToCustomerDb = new Map<
      string,
      { id: string; name: string; phone: string }
    >();

    for (const c of customersDb) {
      const key = normalizePhone(c.phone);
      if (!key) continue;
      phoneToCustomerDb.set(key, {
        id: c.id,
        name: c.name,
        phone: c.phone,
      });
    }

    // ----------------------------------------------------------------
    // 2) Construir o "mapa" de clientes, agora COM id consistente
    // ----------------------------------------------------------------
    const customersMap = new Map<
      string,
      {
        id: string;
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
      const key = normalizePhone(appt.clientPhone);
      if (!key) continue;

      const dbCustomer = phoneToCustomerDb.get(key);

      // Regra de prioridade do ID:
      // 1) appointment.customerId (já ligado em algum fluxo)
      // 2) Customer.id baseado no telefone
      // 3) telefone normalizado (fallback)
      const customerId = appt.customerId ?? dbCustomer?.id ?? key;

      const date = new Date(appt.startAt);
      const formattedDate = date.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const existing = customersMap.get(key);

      if (!existing) {
        customersMap.set(key, {
          id: customerId,
          name: appt.clientName ?? dbCustomer?.name ?? 'Cliente',
          phone: appt.clientPhone ?? dbCustomer?.phone ?? '',
          hasActivePlan: false,
          // só conta como visita se estiver concluído
          totalVisits: appt.status === 'done' ? 1 : 0,
          lastVisitDate: appt.status === 'done' ? formattedDate : undefined,
          nextVisitDate:
            appt.status === 'scheduled' ? formattedDate : undefined,
        });
      } else {
        // Se antes era fallback e agora conhecemos um id real, atualizamos
        if (existing.id === key && customerId !== key) {
          existing.id = customerId;
        }

        // incrementa visitas apenas para atendimentos concluídos
        if (appt.status === 'done') {
          existing.totalVisits += 1;
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
      if (!key) continue;

      const dbCustomer = phoneToCustomerDb.get(key);
      const existing = customersMap.get(key);

      const customerId = existing?.id ?? dbCustomer?.id ?? key;

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
          id: customerId,
          name: plan.customerName ?? dbCustomer?.name ?? 'Cliente',
          phone: plan.customerPhone ?? dbCustomer?.phone ?? '',
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
    // 3) "plans" no formato que o front espera, com customerId consistente
    // ----------------------------------------------------------------
    const plansView = plans.map((p) => {
      const key = normalizePhone(p.customerPhone);
      const dbCustomer = phoneToCustomerDb.get(key);
      const mappedCustomer = customersMap.get(key);

      const customerId = mappedCustomer?.id ?? dbCustomer?.id ?? key;

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
        const key = normalizePhone(appt.clientPhone);
        const dbCustomer = phoneToCustomerDb.get(key);

        // mesma regra de prioridade:
        const customerId = appt.customerId ?? dbCustomer?.id ?? key;

        if (!customerId) {
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
          customerId,
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
    // 5) Retorno no formato que o owner-customers.ts espera
    // ----------------------------------------------------------------
    return {
      customers,
      plans: plansView,
      history,
    };
  }
}
