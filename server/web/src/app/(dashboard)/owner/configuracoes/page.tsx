// src/app/(dashboard)/owner/configuracoes/page.tsx

type TenantSettings = {
  name: string;
  brandName: string;
  defaultCurrency: "EUR";
  country: string;
  timezone: string;
  contactEmail: string;
  contactPhone: string;
};

type LocationSettings = {
  id: string;
  name: string;
  shortCode: string;
  addressLine: string;
  city: string;
  isActive: boolean;
  opensAt: string;
  closesAt: string;
};

type UserRole = "owner" | "admin" | "attendant" | "provider";

type UserSettings = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  locationName?: string;
  isActive: boolean;
};

const tenantSettings: TenantSettings = {
  name: "Demo Barber Group Lda.",
  brandName: "Demo Barber",
  defaultCurrency: "EUR",
  country: "Portugal",
  timezone: "Europe/Lisbon",
  contactEmail: "contato@demobarber.pt",
  contactPhone: "+351 912 000 000",
};

const locations: LocationSettings[] = [
  {
    id: "loc_centro",
    name: "Demo Barber – Centro",
    shortCode: "CENTRO",
    addressLine: "Rua Principal 123",
    city: "Barcelos",
    isActive: true,
    opensAt: "09:00",
    closesAt: "20:00",
  },
  {
    id: "loc_anexo",
    name: "Demo Nails – Anexo",
    shortCode: "ANEXO",
    addressLine: "Rua Secundária 45",
    city: "Barcelos",
    isActive: true,
    opensAt: "10:00",
    closesAt: "19:00",
  },
];

const users: UserSettings[] = [
  {
    id: "u1",
    name: "Rafa Barber",
    email: "rafa@demobarber.pt",
    role: "owner",
    isActive: true,
  },
  {
    id: "u2",
    name: "João Manager",
    email: "joao.manager@demobarber.pt",
    role: "admin",
    locationName: "Demo Barber – Centro",
    isActive: true,
  },
  {
    id: "u3",
    name: "Ana Recepção",
    email: "recepcao@demobarber.pt",
    role: "attendant",
    locationName: "Demo Barber – Centro",
    isActive: true,
  },
  {
    id: "u4",
    name: "Rafa Barber",
    email: "rafa.prof@demobarber.pt",
    role: "provider",
    locationName: "Demo Barber – Centro",
    isActive: true,
  },
  {
    id: "u5",
    name: "Ana Nails",
    email: "ana.nails@demobarber.pt",
    role: "provider",
    locationName: "Demo Nails – Anexo",
    isActive: false,
  },
];

export default function OwnerConfiguracoesPage() {
  return (
    <>
      {/* Cabeçalho */}
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Configurações</h1>
          <p className="text-xs text-slate-400">
            Dados da marca, unidades e utilizadores do espaço.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Preferências gerais
          </button>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Notificações
          </button>
          <button className="px-3 py-1 rounded-lg border border-slate-800 bg-slate-900/80">
            Segurança
          </button>
        </div>
      </header>

      {/* Grid principal: tenant + unidades + utilizadores */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Dados da marca / tenant */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Dados da marca</p>
            <button className="text-[11px] text-emerald-400 hover:underline">
              Editar
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-slate-400">Nome legal</p>
              <p className="text-sm font-semibold">{tenantSettings.name}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Nome da marca</p>
              <p className="text-sm font-semibold">
                {tenantSettings.brandName}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400">Moeda padrão</p>
                <p className="text-sm font-semibold">
                  {tenantSettings.defaultCurrency}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">País</p>
                <p className="text-sm font-semibold">
                  {tenantSettings.country}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400">Timezone</p>
                <p className="text-sm font-semibold">
                  {tenantSettings.timezone}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Telefone</p>
                <p className="text-sm font-semibold">
                  {tenantSettings.contactPhone}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Email de contacto</p>
              <p className="text-sm font-semibold">
                {tenantSettings.contactEmail}
              </p>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Depois estes dados vêm diretamente do{" "}
              <span className="font-mono text-[10px]">Tenant</span> no backend,
              com edição segura aqui.
            </p>
          </div>
        </div>

        {/* Unidades */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Unidades</p>
            <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]">
              + Adicionar unidade
            </button>
          </div>

          <div className="space-y-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-[11px] font-medium">{loc.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {loc.addressLine} · {loc.city}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Código: {loc.shortCode} · Horário: {loc.opensAt}–
                    {loc.closesAt}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={[
                      "inline-block px-2 py-[1px] rounded-full text-[9px]",
                      loc.isActive
                        ? "bg-emerald-500/20 text-emerald-100"
                        : "bg-slate-700 text-slate-100",
                    ].join(" ")}
                  >
                    {loc.isActive ? "Ativa" : "Inativa"}
                  </span>
                  <button className="mt-2 px-2 py-[2px] rounded text-[10px] border border-slate-700 text-slate-200 hover:border-emerald-500">
                    Gerir
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-2 text-[10px] text-slate-500">
            Estas unidades mapeiam diretamente as{" "}
            <span className="font-mono text-[10px]">Locations</span> do backend,
            usadas em agenda, profissionais e financeiro.
          </p>
        </div>

        {/* Utilizadores & roles */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400">Utilizadores & permissões</p>
            <button className="px-3 py-1 rounded-lg border border-emerald-600 bg-emerald-600/20 text-emerald-200 text-[11px]">
              + Convidar utilizador
            </button>
          </div>

          <div className="overflow-auto max-h-80 pr-1">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left py-2 pr-3 border-b border-slate-800">
                    Nome
                  </th>
                  <th className="text-left py-2 pr-3 border-b border-slate-800">
                    Email
                  </th>
                  <th className="text-left py-2 pr-3 border-b border-slate-800">
                    Role
                  </th>
                  <th className="text-left py-2 pr-3 border-b border-slate-800">
                    Unidade
                  </th>
                  <th className="text-left py-2 pl-3 border-b border-slate-800">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-950/50">
                    <td className="py-2 pr-3 text-slate-200">{user.name}</td>
                    <td className="py-2 pr-3 text-slate-200">{user.email}</td>
                    <td className="py-2 pr-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="py-2 pr-3 text-slate-300">
                      {user.locationName ?? "—"}
                    </td>
                    <td className="py-2 pl-3">
                      <UserStatusBadge isActive={user.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[10px] text-slate-500">
            Estes utilizadores correspondem à tabela{" "}
            <span className="font-mono text-[10px]">User</span> com roles como
            owner, admin, attendant e provider.
          </p>
        </div>
      </section>
    </>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  switch (role) {
    case "owner":
      return (
        <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
          Owner
        </span>
      );
    case "admin":
      return (
        <span className={`${base} bg-sky-500/20 text-sky-100`}>Admin</span>
      );
    case "attendant":
      return (
        <span className={`${base} bg-indigo-500/20 text-indigo-100`}>
          Recepção
        </span>
      );
    case "provider":
      return (
        <span className={`${base} bg-slate-700 text-slate-100`}>
          Profissional
        </span>
      );
    default:
      return null;
  }
}

function UserStatusBadge({ isActive }: { isActive: boolean }) {
  const base = "inline-block px-2 py-[1px] rounded-full text-[9px]";
  if (isActive) {
    return (
      <span className={`${base} bg-emerald-500/20 text-emerald-100`}>
        Ativo
      </span>
    );
  }
  return <span className={`${base} bg-slate-700 text-slate-100`}>Inativo</span>;
}
