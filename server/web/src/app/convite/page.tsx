"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";

type ValidateInviteResponse = {
  tenant: { id: string; brandName: string | null; slug: string };
  invite: {
    role: "owner" | "admin" | "attendant" | "provider";
    specialty: string | null;
    locationId: string | null;
    locationName: string | null;
    email: string | null;
    phone: string | null;
    expiresAt: string;
  };
};

type AcceptInviteResponse = {
  user: { id: string; tenantId: string; role: string };
  tokens: { access: string; refresh: string };
};

export default function ConvitePage() {
  return (
    <Suspense fallback={<ConviteLoading />}>
      <ConviteClient />
    </Suspense>
  );
}

function ConviteLoading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-slate-300 text-sm">Carregando convite...</p>
      </div>
    </div>
  );
}

function ConviteClient() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ValidateInviteResponse | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const emailLocked = useMemo(() => !!data?.invite.email, [data]);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        setErr(null);

        if (!token) {
          setErr("Token ausente na URL.");
          return;
        }

        const res = await apiClient<ValidateInviteResponse>(
          `/invites/validate?token=${encodeURIComponent(token)}`,
          { method: "GET" },
        );

        if (!mounted) return;

        setData(res);
        if (res.invite.email) setEmail(res.invite.email);
        if (res.invite.phone) setPhone(res.invite.phone);
      } catch (e) {
        if (!mounted) return;
        const msg =
          e instanceof ApiError ? e.message : "Falha ao validar convite.";
        setErr(msg);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [token]);

  async function onAccept() {
    try {
      setErr(null);

      if (!name.trim()) return setErr("Preenche o nome.");
      if (!email.trim()) return setErr("Preenche o email.");
      if (password.length < 8)
        return setErr("Senha precisa ter pelo menos 8 caracteres.");
      if (password !== password2) return setErr("As senhas não coincidem.");

      const res = await apiClient<AcceptInviteResponse>("/invites/accept", {
        method: "POST",
        body: {
          token,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          password,
        },
      });

      localStorage.setItem("fluxo_token", res.tokens.access);
      localStorage.setItem("fluxo_refresh", res.tokens.refresh);

      window.location.href = "/";
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "Falha ao aceitar convite.";
      setErr(msg);
    }
  }

  if (loading) {
    return <ConviteLoading />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-red-300 text-sm">{err ?? "Convite inválido."}</p>
        </div>
      </div>
    );
  }

  const roleLabel =
    data.invite.role === "provider"
      ? "Profissional"
      : data.invite.role === "attendant"
        ? "Atendente"
        : data.invite.role === "admin"
          ? "Admin"
          : data.invite.role;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4">
          <p className="text-slate-200 text-sm font-semibold">
            Convite para {roleLabel}
          </p>
          <p className="text-slate-400 text-xs">
            {data.tenant.brandName ?? "Tenant"}{" "}
            {data.invite.locationName ? `• ${data.invite.locationName}` : ""}
          </p>
          {data.invite.specialty ? (
            <p className="text-slate-500 text-[11px] mt-1">
              Especialidade:{" "}
              <span className="text-slate-300">{data.invite.specialty}</span>
            </p>
          ) : null}
        </div>

        {err ? (
          <div className="mb-3 rounded-xl border border-red-800 bg-red-900/20 p-3">
            <p className="text-red-200 text-xs">{err}</p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Nome
            </label>
            <input
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teu nome"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Email
            </label>
            <input
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teu@email.com"
              disabled={emailLocked}
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Telefone (opcional)
            </label>
            <input
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 ..."
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Senha
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Confirmar senha
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </div>

          <button
            onClick={onAccept}
            className="w-full rounded-xl border border-emerald-600 bg-emerald-600/20 px-3 py-2 text-sm text-emerald-200"
          >
            Criar conta e entrar
          </button>

          <p className="text-[10px] text-slate-500">
            Ao aceitar, a conta é criada e tu entras automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
