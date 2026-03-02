import { apiClient } from "@/lib/api-client";

export type PublicPaymentStatusResponse = {
  ok: boolean;
  payment?: {
    id: string;
    status: string;
    kind: string;
    amountCents: number;
    currency: string;
    appointmentId: string;
  };
  appointment?: {
    id: string;
    status: string;
    startAt?: string;
    endAt?: string;
    serviceName?: string;
    clientName?: string;
    provider?: {
      id: string;
      name?: string | null;
      user?: {
        name?: string | null;
      } | null;
    } | null;
    location?: {
      id: string;
      name?: string | null;
    } | null;
  } | null;
};

export async function fetchPublicPaymentStatus(params: {
  sessionId: string;
}): Promise<PublicPaymentStatusResponse> {
  const { sessionId } = params;

  return apiClient<PublicPaymentStatusResponse>(
    `/public/payment-status?session_id=${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
}
