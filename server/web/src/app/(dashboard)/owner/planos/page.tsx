// web/src/app/(dashboard)/owner/planos/page.tsx
import { Suspense } from "react";
import OwnerPlanosClient from "./OwnerPlanosClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs text-slate-400">
          Carregando planos de assinatura...
        </div>
      }
    >
      <OwnerPlanosClient />
    </Suspense>
  );
}
