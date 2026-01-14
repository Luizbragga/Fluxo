import { apiClient } from "@/lib/api-client";

export type ProviderNotification = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null; // ex: "appointment_created" etc
  createdAt: string; // ISO
  readAt?: string | null; // se existir, indica lida
};

export type ProviderNotificationsResponse =
  | ProviderNotification[]
  | { data: ProviderNotification[] };

function normalize(raw: any): ProviderNotification[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return (list || [])
    .map((n: any) => ({
      id: String(n?.id ?? ""),
      title: n?.title ?? n?.subject ?? null,
      message: n?.message ?? n?.body ?? n?.content ?? null,
      type: n?.type ?? n?.kind ?? null,
      createdAt: String(
        n?.createdAt ?? n?.created_at ?? n?.date ?? new Date().toISOString()
      ),
      readAt: n?.readAt ?? n?.read_at ?? null,
    }))
    .filter((n: ProviderNotification) => Boolean(n.id));
}

/**
 * Tenta endpoints comuns:
 * 1) GET /notifications/me
 * 2) GET /notifications
 */
export async function fetchMyNotifications(): Promise<ProviderNotification[]> {
  try {
    const raw = await apiClient<ProviderNotificationsResponse>(
      "/notifications/me"
    );
    return normalize(raw);
  } catch {
    const raw = await apiClient<ProviderNotificationsResponse>(
      "/notifications"
    );
    return normalize(raw);
  }
}

/**
 * Marca como lida:
 * tenta:
 * 1) PATCH /notifications/:id/read
 * 2) PATCH /notifications/:id
 */
export async function markNotificationAsRead(id: string) {
  try {
    await apiClient(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    });
  } catch {
    await apiClient(`/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
  }
}
