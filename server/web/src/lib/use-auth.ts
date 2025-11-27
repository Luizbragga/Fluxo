"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, CurrentUser } from "./auth";

type UseRequireAuthOptions = {
  /** se quiser garantir role específica (ex: "owner") */
  requiredRole?: string;
};

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { requiredRole } = options;
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      // 1) verifica se existe token salvo
      if (typeof window === "undefined") return;

      const token = localStorage.getItem("fluxo_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        // 2) chama /auth/me pra validar o token e pegar o user
        const currentUser = await fetchCurrentUser();

        // 3) se tiver role exigida e não bater, volta pro login
        if (requiredRole && currentUser.role !== requiredRole) {
          router.replace("/login");
          return;
        }

        setUser(currentUser);
      } catch (err) {
        console.error("Erro ao buscar usuário atual:", err);

        // limpa sessão zoada
        localStorage.removeItem("fluxo_token");
        localStorage.removeItem("fluxo_refresh_token");
        localStorage.removeItem("fluxo_role");
        localStorage.removeItem("fluxo_tenant");

        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router, requiredRole]);

  return { user, loading };
}
