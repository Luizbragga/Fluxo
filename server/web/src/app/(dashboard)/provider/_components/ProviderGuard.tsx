"use client";

import { ReactNode } from "react";
import { useRequireAuth } from "@/lib/use-auth";

export default function ProviderGuard({ children }: { children: ReactNode }) {
  const { loading } = useRequireAuth({ requiredRole: "provider" });

  if (loading) return null; // depois a gente coloca um loading bonitinho
  return <>{children}</>;
}
