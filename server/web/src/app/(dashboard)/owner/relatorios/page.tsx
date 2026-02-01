import { Suspense } from "react";
import OwnerRelatoriosClient from "./OwnerRelatoriosClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OwnerRelatoriosClient />
    </Suspense>
  );
}
