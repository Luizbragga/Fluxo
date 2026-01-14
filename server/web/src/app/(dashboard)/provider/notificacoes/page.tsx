"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchMyNotifications,
  markNotificationAsRead,
  type ProviderNotification,
} from "../_api/provider-notifications";

function formatDatePt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isUnread(n: ProviderNotification) {
  return !n.readAt;
}

function getTypeLabel(type?: string | null) {
  const t = (type ?? "").toLowerCase();
  if (!t) return "Geral";
  if (t.includes("appointment")) return "Agendamento";
  if (t.includes("plan")) return "Plano";
  if (t.includes("payment")) return "Pagamento";
  return type ?? "Geral";
}

export default function ProviderNotificationsPage() {
  const [items, setItems] = useState<ProviderNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchMyNotifications();

      // ordena desc (mais recente primeiro)
      const sorted = list
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      setItems(sorted);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Erro ao carregar notificações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const unreadCount = useMemo(() => items.filter(isUnread).length, [items]);

  const visible = useMemo(() => {
    if (filter === "unread") return items.filter(isUnread);
    return items;
  }, [items, filter]);

  async function handleMarkRead(id: string) {
    // otimista
    const prev = items;
    setBusyId(id);
    setItems((cur) =>
      cur.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n
      )
    );

    try {
      await markNotificationAsRead(id);
    } catch (e) {
      console.error(e);
      // rollback
      setItems(prev);
      setError("Não foi possível marcar como lida.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAllAsRead() {
    const unread = items.filter(isUnread);
    if (unread.length === 0) return;

    setMarkAllBusy(true);
    setError(null);

    // otimista
    const prev = items;
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => (n.readAt ? n : { ...n, readAt: now })));

    try {
      // chama endpoint por notificação (MVP)
      for (const n of unread) {
        await markNotificationAsRead(n.id);
      }
    } catch (e) {
      console.error(e);
      setItems(prev);
      setError("Não foi possível marcar todas como lidas.");
    } finally {
      setMarkAllBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-100">Notificações</h1>
        <p className="mt-2 text-sm text-slate-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Notificações</h1>
          <p className="mt-1 text-xs text-slate-400">
            Você tem{" "}
            <span className="text-slate-200 font-medium">{unreadCount}</span>{" "}
            não lida(s).
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/80 overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1 text-[11px] ${
                filter === "all"
                  ? "text-slate-50 bg-slate-800"
                  : "text-slate-400"
              }`}
              onClick={() => setFilter("all")}
            >
              Todas
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-[11px] ${
                filter === "unread"
                  ? "text-slate-50 bg-slate-800"
                  : "text-slate-400"
              }`}
              onClick={() => setFilter("unread")}
            >
              Não lidas
            </button>
          </div>

          <button
            type="button"
            className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px] text-slate-200 hover:bg-slate-900"
            onClick={load}
          >
            Recarregar
          </button>

          <button
            type="button"
            disabled={markAllBusy || unreadCount === 0}
            className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-[11px] text-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleMarkAllAsRead}
          >
            {markAllBusy ? "Marcando..." : "Marcar todas como lidas"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-100">
            Caixa de entrada
          </p>
          <p className="text-[11px] text-slate-400">
            {visible.length} registro(s)
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">
            {filter === "unread"
              ? "Você não tem notificações não lidas."
              : "Você ainda não tem notificações."}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {visible.map((n) => {
              const unread = isUnread(n);
              const title = n.title?.trim() || "Notificação";
              const msg = n.message?.trim() || "Sem detalhes.";
              const typeLabel = getTypeLabel(n.type);

              return (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-4 ${
                    unread ? "bg-slate-950/30" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-100 font-medium truncate">
                        {title}
                      </p>

                      {unread && (
                        <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                          Nova
                        </span>
                      )}

                      <span className="text-[10px] px-2 py-0.5 rounded border border-slate-700 bg-slate-900/60 text-slate-300">
                        {typeLabel}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-300 break-words">
                      {msg}
                    </p>

                    <p className="mt-2 text-[11px] text-slate-500">
                      {formatDatePt(n.createdAt)}
                      {n.readAt ? (
                        <>
                          {" "}
                          • lida em{" "}
                          <span className="text-slate-400">
                            {formatDatePt(n.readAt)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {unread ? (
                      <button
                        type="button"
                        disabled={busyId === n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px] text-slate-200 hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {busyId === n.id ? "..." : "Marcar como lida"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">Lida</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
