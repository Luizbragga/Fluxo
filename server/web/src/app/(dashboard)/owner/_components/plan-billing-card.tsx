import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOwnerCustomerPlans,
  type OwnerCustomerPlan,
} from "../_api/owner-plans";

type PlanBillingCardProps = {
  planTemplateId: string;
};

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatMoneyCents(cents: number | null | undefined) {
  if (cents == null) return "-";
  return (cents / 100).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function getPlanStatusLabel(status: OwnerCustomerPlan["status"]) {
  switch (status) {
    case "active":
      return "Ativo";
    case "late":
      return "Em atraso";
    case "suspended":
      return "Suspenso";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

function getPlanStatusClass(status: OwnerCustomerPlan["status"]) {
  switch (status) {
    case "active":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "late":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "suspended":
      return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
    case "cancelled":
      return "border-slate-500/40 bg-slate-500/10 text-slate-300";
    default:
      return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  }
}

function getPaymentStatusLabel(status: OwnerCustomerPlan["lastPaymentStatus"]) {
  switch (status) {
    case "paid":
      return "Pago";
    case "pending":
      return "Pendente";
    case "late":
      return "Em atraso";
    default:
      return status;
  }
}

function getPaymentStatusClass(status: OwnerCustomerPlan["lastPaymentStatus"]) {
  switch (status) {
    case "paid":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "pending":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "late":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    default:
      return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  }
}

function buildUsageLabel(plan: OwnerCustomerPlan) {
  const visitsLimit =
    (plan.planTemplate.visitsPerInterval ?? 0) + plan.carryOverVisits;

  if (visitsLimit > 0) {
    return `${plan.visitsUsedInCycle}/${visitsLimit} visitas no ciclo`;
  }

  return `${plan.visitsUsedInCycle} visitas usadas`;
}

// SERVER COMPONENT: não tem "use client", não usa hooks
export async function PlanBillingCard({
  planTemplateId,
}: PlanBillingCardProps) {
  const allPlans = await getOwnerCustomerPlans();

  const plansForTemplate = allPlans.filter(
    (plan) => plan.planTemplate.id === planTemplateId
  );

  const totalClients = plansForTemplate.length;
  const activeCount = plansForTemplate.filter(
    (p) => p.status === "active"
  ).length;
  const lateCount = plansForTemplate.filter((p) => p.status === "late").length;

  return (
    <Card className="h-full bg-slate-950/40 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-slate-200">
          Cobranças &amp; pagamentos
        </CardTitle>

        <div className="flex gap-2 text-xs text-slate-400">
          <span>{totalClients} clientes</span>
          <span className="text-emerald-300">• {activeCount} ativos</span>
          <span className="text-red-300">• {lateCount} em atraso</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {plansForTemplate.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nenhum cliente com este plano ainda.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {plansForTemplate.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-100">
                      {plan.customerName}
                    </p>
                    {plan.customerPhone && (
                      <p className="truncate text-[11px] text-slate-400">
                        {plan.customerPhone}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className={`border px-2 py-0 text-[10px] font-normal ${getPlanStatusClass(
                        plan.status
                      )}`}
                    >
                      {getPlanStatusLabel(plan.status)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`border px-2 py-0 text-[10px] font-normal ${getPaymentStatusClass(
                        plan.lastPaymentStatus
                      )}`}
                    >
                      {getPaymentStatusLabel(plan.lastPaymentStatus)}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    Ciclo: {formatDate(plan.currentCycleStart)} →{" "}
                    {formatDate(plan.currentCycleEnd)}
                  </span>
                  <span>{buildUsageLabel(plan)}</span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    Preço base: {formatMoneyCents(plan.planTemplate.priceCents)}
                  </span>
                  <span>
                    Último pagamento:{" "}
                    {getPaymentStatusLabel(plan.lastPaymentStatus)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
