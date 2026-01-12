"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/provider", label: "Início" },
  { href: "/provider/agenda", label: "Agenda" },
  { href: "/provider/ganhos", label: "Ganhos" },
  { href: "/provider/perfil", label: "Perfil" },
];

export default function ProviderSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:gap-4 md:border-r md:border-slate-800 md:bg-slate-950/40 md:p-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm font-semibold text-slate-100">Fluxo</p>
        <p className="text-xs text-slate-400">Painel do profissional</p>
      </div>

      <nav className="space-y-1 text-sm">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-xl border px-3 py-2 transition-colors",
                active
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                  : "border-slate-800 bg-slate-900/30 text-slate-200 hover:border-slate-700",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
