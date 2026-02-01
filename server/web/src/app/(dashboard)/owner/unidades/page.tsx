import { Suspense } from "react";
import OwnerUnidadesClient from "./OwnerUnidadesClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerUnidadesClient />
    </Suspense>
  );
}
