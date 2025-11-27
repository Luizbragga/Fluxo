// src/app/(dashboard)/owner/layout.tsx
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

type OwnerLayoutProps = {
  children: ReactNode;
};

export default function OwnerLayout({ children }: OwnerLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Topbar />

        <main className="flex-1 px-6 py-5 overflow-auto">
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
