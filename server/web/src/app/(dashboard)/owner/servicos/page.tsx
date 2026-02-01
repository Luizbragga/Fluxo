import { Suspense } from "react";
import OwnerServicosClient from "./OwnerServicosClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerServicosClient />
    </Suspense>
  );
}
