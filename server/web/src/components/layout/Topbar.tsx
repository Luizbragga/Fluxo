// src/components/layout/Topbar.tsx

export function Topbar() {
  return (
    <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold">Visão geral</h1>
        <p className="text-xs text-slate-400">
          Resumo rápido de agenda, planos e financeiro
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-300">
        <button className="px-3 py-1 rounded-full border border-slate-700 hover:border-emerald-500 hover:text-emerald-300">
          Período
        </button>
        <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
          Rafa Barber · Owner
        </span>
      </div>
    </header>
  );
}
