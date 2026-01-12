import ProviderGuard from "./_components/ProviderGuard";
import ProviderSidebar from "./_components/ProviderSidebar";

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProviderGuard>
      <div className="min-h-screen bg-slate-950 text-slate-50 flex">
        <ProviderSidebar />

        <main className="flex-1 px-6 py-5 overflow-auto">
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    </ProviderGuard>
  );
}
