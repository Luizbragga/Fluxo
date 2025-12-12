import { apiClient } from "@/lib/api-client";

export type CancellationRow = {
  id: string;
  date: string; // "18 Nov 2025"
  time: string; // "19:00"
  customerName: string;
  professionalName: string;
  serviceName: string;
  type: "cancelled" | "no_show";
  reason?: string;
};

type BackendCancellationItem = {
  id: string;
  date: string; // ISO
  status: "cancelled" | "no_show" | string;
  customerName: string | null;
  professionalName: string | null;
  serviceName: string | null;
  reason?: string | null;
};

type BackendCancellationsResponse = {
  from: string;
  to: string;
  items: BackendCancellationItem[];
};

export async function fetchOwnerCancellations(): Promise<CancellationRow[]> {
  const response = await apiClient<BackendCancellationsResponse>(
    "/reports/cancellations",
    { method: "GET" }
  );

  const items = response.items ?? [];

  return items.map((item) => {
    const d = new Date(item.date);

    const dateLabel = d.toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const timeLabel = d.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const normalizedType: "cancelled" | "no_show" =
      item.status === "no_show" ? "no_show" : "cancelled";

    return {
      id: item.id,
      date: dateLabel,
      time: timeLabel,
      customerName: item.customerName ?? "Cliente",
      professionalName: item.professionalName ?? "Profissional",
      serviceName: item.serviceName ?? "Serviço",
      type: normalizedType,
      reason: item.reason ?? undefined,
    };
  });
}
