// web/src/app/(dashboard)/owner/page.tsx
import { Suspense } from "react";
import OwnerPageClient from "./OwnerPageClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-slate-400">
          Carregando painel do proprietário...
        </div>
      }
    >
      <OwnerPageClient />
    </Suspense>
  );
}
