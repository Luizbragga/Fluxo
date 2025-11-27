// src/components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  icon: string;
};

const ownerNavItems: NavItem[] = [
  { label: "Visão geral", href: "/owner", icon: "📊" },
  { label: "Agenda", href: "/owner/agenda", icon: "📅" },
  { label: "Profissionais", href: "/owner/profissionais", icon: "💈" },
  { label: "Clientes", href: "/owner/clientes", icon: "👥" },
  { label: "Serviços", href: "/owner/servicos", icon: "📦" },
  { label: "Financeiro", href: "/owner/financeiro", icon: "💳" },
  { label: "Planos", href: "/owner/planos", icon: "🧾" },
  { label: "Relatórios", href: "/owner/relatorios", icon: "📑" },
  { label: "Configurações", href: "/owner/configuracoes", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur flex flex-col">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-emerald-500 flex items-center justify-center font-bold text-slate-950">
          F
        </div>
        <div>
          <p className="text-sm font-semibold">Fluxo</p>
          <p className="text-xs text-slate-400">Painel do proprietário</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
        {ownerNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/owner" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "w-full flex items-center gap-2 rounded-xl px-3 py-2 transition-colors",
                isActive
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-300 hover:bg-slate-800/60",
              ].join(" ")}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800 text-xs text-slate-400">
        <p>Hoje · 26 Nov 2025</p>
        <p className="mt-1">Unidade: Demo Barber - Centro</p>
      </div>
    </aside>
  );
}
