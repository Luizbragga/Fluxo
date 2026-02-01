import { Suspense } from "react";
import OwnerProfessionalsClient from "./OwnerProfessionalsClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs text-slate-400">
          Carregando profissionais...
        </div>
      }
    >
      <OwnerProfessionalsClient />
    </Suspense>
  );
}
