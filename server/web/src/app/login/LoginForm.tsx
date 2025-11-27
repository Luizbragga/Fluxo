"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          // ⚠️ IMPORTANTE:
          // Se no Swagger o corpo do /auth/login usar outros nomes (ex: "username" em vez de "email"),
          // adapta esses campos aqui para bater exatamente com o que o Swagger mostra.
        }),
      });

      if (!res.ok) {
        let body: any = null;
        try {
          body = await res.json();
        } catch {
          // ignore
        }
        console.error("Erro no login", res.status, body);
        setError(body?.message ?? "Falha ao fazer login");
        return;
      }

      const data = await res.json();
      console.log("LOGIN OK =>", data);

      // 👉 Próximo passo (em outra etapa):
      // - guardar accessToken / refreshToken
      // - buscar /auth/me
      // - redirecionar para /owner
    } catch (err) {
      console.error("Erro de rede no login", err);
      setError("Erro de rede ao tentar login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          className="border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/50"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@demo.com"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Password</label>
        <input
          type="password"
          className="border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/50"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="********"
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md px-4 py-2 text-sm font-medium bg-black text-white disabled:opacity-60"
      >
        {loading ? "A entrar..." : "Entrar"}
      </button>
    </form>
  );
}
