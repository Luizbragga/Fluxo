"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import type { PublicPaymentStatusResponse as PaymentStatusResponse } from "../../../_api/payment-status";

function formatMoney(cents: number, currency: string) {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: currency || "EUR",
    }).format(value);
  } catch {
    return `€${value.toFixed(2)}`;
  }
}

export default function BookingConfirmedPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();

  const tenantSlug = (params as any)?.tenantSlug as string | undefined;
  const locationSlug = (params as any)?.locationSlug as string | undefined;

  const sessionId = search.get("session_id") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<PaymentStatusResponse | null>(null);

  const paid = useMemo(() => {
    const s = data?.payment?.status;
    return s === "paid" || s === "succeeded";
  }, [data?.payment?.status]);

  const amountLabel = useMemo(() => {
    if (!data?.payment) return null;
    return formatMoney(data.payment.amountCents, data.payment.currency);
  }, [data?.payment]);
  const appointmentLabel = useMemo(() => {
    const a = data?.appointment;
    if (!a?.startAt) return null;

    const start = new Date(a.startAt);
    const day = start.toLocaleDateString("pt-PT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit",
    });

    const time = start.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const providerName =
      a?.provider?.name ?? a?.provider?.user?.name ?? "Profissional";

    const serviceName = a?.serviceName ?? "Serviço";

    const locationName = a?.location?.name ?? null;

    return { day, time, providerName, serviceName, locationName };
  }, [data?.appointment]);

  useEffect(() => {
    if (!sessionId && tenantSlug && locationSlug) {
      router.replace(`/book/${tenantSlug}/${locationSlug}`);
    }
  }, [sessionId, tenantSlug, locationSlug, router]);

  // ✅ carrega status do pagamento (e espera webhook atualizar)
  useEffect(() => {
    let alive = true;
    let t: any;

    async function poll() {
      if (!sessionId?.trim()) {
        setError("Sessão de pagamento ausente. Volte e tente novamente.");
        setLoading(false);
        return;
      }

      try {
        const { fetchPublicPaymentStatus } =
          await import("../../../_api/payment-status");

        const res = await fetchPublicPaymentStatus({ sessionId });

        if (!alive) return;

        setData(res);

        const status = res?.payment?.status;

        if (status === "paid" || status === "succeeded") {
          setLoading(false);
          setError(null);
          return;
        }

        if (status === "failed" || status === "canceled") {
          setLoading(false);
          setError("Pagamento não confirmado. Você pode tentar novamente.");
          return;
        }

        // ainda processando -> tenta de novo
        t = setTimeout(poll, 1500);
      } catch (e: any) {
        if (!alive) return;

        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha ao confirmar o pagamento. Tentando novamente...";
        setError(msg);

        t = setTimeout(poll, 2000);
      }
    }

    setLoading(true);
    setError(null);
    poll();

    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [sessionId]);

  function handleNewBooking() {
    if (!tenantSlug || !locationSlug) return;
    router.replace(`/book/${tenantSlug}/${locationSlug}`);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">
          Agendamento online
        </p>

        <h1 className="text-xl font-semibold mt-1">
          {loading
            ? "Confirmando pagamento..."
            : error
              ? "Não foi possível confirmar ❌"
              : "Agendamento confirmado ✅"}
        </h1>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
          {loading ? (
            <div className="text-slate-300">
              Estamos confirmando seu pagamento no sistema.
              <div className="mt-2 text-[12px] text-slate-500 break-all">
                Sessão: {sessionId}
              </div>
            </div>
          ) : error ? (
            <div className="text-rose-200">
              {error}
              <div className="mt-2 text-[12px] text-slate-500 break-all">
                Sessão: {sessionId}
              </div>
            </div>
          ) : (
            <div className="text-slate-200">
              <p className="text-slate-100 font-semibold">
                Seu agendamento foi concluído com sucesso.
              </p>
              {appointmentLabel && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-[13px] text-slate-200 space-y-1">
                  {appointmentLabel.locationName && (
                    <div>
                      <span className="text-slate-400">Local: </span>
                      <span className="text-slate-100">
                        {appointmentLabel.locationName}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-400">Quando: </span>
                    <span className="text-slate-100">
                      {appointmentLabel.day} às {appointmentLabel.time}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400">Serviço: </span>
                    <span className="text-slate-100">
                      {appointmentLabel.serviceName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400">Profissional: </span>
                    <span className="text-slate-100">
                      {appointmentLabel.providerName}
                    </span>
                  </div>
                </div>
              )}

              <p className="mt-2 text-slate-300">
                Aguardamos você! Chegue com alguns minutos de antecedência.
              </p>

              <p className="mt-2 text-slate-400 text-[13px]">
                (Depois a gente liga isso com lembretes/WhatsApp/SMS.)
              </p>

              {amountLabel && (
                <div className="mt-3 text-[13px] text-slate-300">
                  Valor pago:{" "}
                  <span className="text-slate-100">{amountLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleNewBooking}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold border border-emerald-500 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 transition-colors"
          >
            Realizar novo agendamento
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!tenantSlug || !locationSlug) return;
            router.replace(`/book/${tenantSlug}/${locationSlug}`);
          }}
          className="mt-2 w-full text-center text-[12px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          Fechar
        </button>

        <p className="mt-3 text-[11px] text-slate-500">
          Se precisar alterar ou cancelar, entre em contacto com a unidade.
        </p>
      </div>
    </div>
  );
}
