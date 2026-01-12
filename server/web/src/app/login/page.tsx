"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { LoginForm } from "./LoginForm";

type LoginResponse = {
  user: {
    id: string;
    tenantId: string;
    role: string;
  };
  tokens: {
    access: string;
    refresh: string;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: {
          email,
          password,
        },
      });

      // token vem de res.tokens.access (pelo teu AuthService)
      const token = res.tokens.access;

      if (!token) {
        throw new Error("Token de acesso não encontrado na resposta do login.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("fluxo_token", token);

        // se quiser já guardar o refresh pra depois:
        localStorage.setItem("fluxo_refresh_token", res.tokens.refresh);
        localStorage.setItem("fluxo_role", res.user.role);
        localStorage.setItem("fluxo_tenant", res.user.tenantId);
      }

      const role = res.user.role;

      if (role === "owner" || role === "admin") {
        router.push("/owner");
        return;
      }

      if (role === "provider") {
        router.push("/provider");
        return;
      }

      if (role === "attendant") {
        router.push("/attendant");
        return;
      }

      // fallback seguro
      router.push("/login");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err?.message ?? "Erro ao fazer login. Verifica as credenciais."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center font-bold text-slate-950">
            F
          </div>
          <div>
            <p className="text-sm font-semibold">Fluxo</p>
            <p className="text-xs text-slate-400">
              Acesso ao painel do proprietário
            </p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-xs text-slate-300" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-300" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {errorMessage && (
            <p className="text-xs text-rose-400">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-[11px] text-slate-500">
          Usa aqui o e-mail/senha que você já tem cadastrados no Nest como
          owner/admin. <code>POST /v1/auth/login</code> retorna{" "}
          <code>{`{ user, tokens: { access, refresh } }`}</code>, e o front já
          está alinhado com isso.
        </p>
      </div>
    </div>
  );
}
