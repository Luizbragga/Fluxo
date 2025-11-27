import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { ProviderPayoutsQueryDto } from '../reports/dto/provider-payouts-query.dto';

@Injectable()
export class OverviewService {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Monta o overview do owner.
   *
   * Por enquanto:
   * - overviewKpis, nextAppointments => mock
   * - quickFinancialCards => dados reais (earnings)
   * - professionalPayouts => dados reais (payouts)
   */
  async getOwnerOverview(params: { tenantId: string }) {
    const { tenantId } = params;

    // 1) Buscar payouts reais (repasses para profissionais)
    const payoutsReport = await this.reportsService.getProviderPayouts(
      tenantId,
      {} as ProviderPayoutsQueryDto, // sem filtros -> mês atual (resolveDateRange)
    );

    const fromDate = new Date(payoutsReport.from);
    const toDate = new Date(payoutsReport.to);

    const formatShortDate = (d: Date) =>
      d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });

    // Agrupar payouts por profissional
    const byProvider = new Map<
      string,
      {
        providerId: string;
        providerName: string;
        totalProviderEarningsCents: number;
        hasPending: boolean;
        count: number;
      }
    >();

    for (const item of payoutsReport.items) {
      const providerId = item.provider?.id ?? 'unknown';
      const providerName = item.provider?.name ?? 'Sem profissional';

      let bucket = byProvider.get(providerId);
      if (!bucket) {
        bucket = {
          providerId,
          providerName,
          totalProviderEarningsCents: 0,
          hasPending: false,
          count: 0,
        };
        byProvider.set(providerId, bucket);
      }

      bucket.totalProviderEarningsCents += item.providerEarningsCents;
      bucket.count += 1;

      if (item.payoutStatus !== 'paid') {
        bucket.hasPending = true;
      }
    }

    const professionalPayouts = Array.from(byProvider.values()).map(
      (bucket) => ({
        id: bucket.providerId,
        professionalName: bucket.providerName,
        periodLabel: `Período ${formatShortDate(
          fromDate,
        )} – ${formatShortDate(toDate)} · ${bucket.count} atendimentos`,
        amount: Math.round(bucket.totalProviderEarningsCents / 100), // cents -> euros
        status: bucket.hasPending ? ('pending' as const) : ('paid' as const),
      }),
    );

    // 2) Buscar earnings reais (receita / partilha casa x profissional)
    const earningsReport = await this.reportsService.getProviderEarnings({
      tenantId,
    });

    const totalServicesEuros = Math.round(
      earningsReport.totals.servicePriceCents / 100,
    );
    const houseEarningsEuros = Math.round(
      earningsReport.totals.houseEarningsCents / 100,
    );

    const quickFinancialCards = [
      {
        id: 'services_revenue_month',
        title: 'Receita de serviços (mês)',
        value: `€ ${totalServicesEuros}`,
        helper: `Período ${formatShortDate(fromDate)} – ${formatShortDate(
          toDate,
        )}`,
        accent: 'positive' as const,
      },
      {
        id: 'house_earnings_month',
        title: 'Parte da barbearia (mês)',
        value: `€ ${houseEarningsEuros}`,
        helper: 'Após comissões pagas aos profissionais',
        accent: 'neutral' as const,
      },
    ];

    // 3) Restante por enquanto segue mockado
    return {
      overviewKpis: [
        {
          id: 'appointments_today',
          title: 'Agendamentos de hoje',
          value: '18',
          helper: '+4 vs. mesma hora ontem',
          tone: 'positive',
        },
        {
          id: 'expected_revenue_today',
          title: 'Receita prevista hoje',
          value: '€ 540',
          helper: 'Inclui serviços avulsos e planos',
          tone: 'neutral',
        },
        {
          id: 'active_plans',
          title: 'Planos ativos',
          value: '27',
          helper: '€ 1.350 / mês recorrente',
          tone: 'positive',
        },
        {
          id: 'to_pay_professionals',
          title: 'A pagar aos profissionais',
          value: '€ 210',
          helper: 'Próxima semana',
          tone: 'neutral',
        },
      ],
      nextAppointments: [
        {
          id: '1',
          time: '09:00',
          title: 'Corte masculino',
          detail: 'Cliente 50 por cento · Rafa Barber',
          source: 'plan',
        },
        {
          id: '2',
          time: '09:30',
          title: 'Barba express',
          detail: 'Walk-in · Caixa',
          source: 'walk_in',
        },
        {
          id: '3',
          time: '10:00',
          title: 'Corte + Barba',
          detail: 'Miguel · Agendado app',
          source: 'app',
        },
      ],
      quickFinancialCards,
      professionalPayouts,
    };
  }
}
