// src/lib/appointments.ts
import { apiClient } from "@/lib/api-client";

export type CancelAndRefundResponse = {
  replay?: boolean;
  appointment?: {
    id: string;
    status?: string;
    bookingPayment?: {
      id: string;
      status?: string;
      refundedAt?: string | null;
    } | null;
  };
  bookingPayment?: {
    id: string;
    status?: string;
    refundedAt?: string | null;
  };
};

export async function cancelAppointmentAndRefund(params: {
  appointmentId: string;
  reason?: string;
}) {
  const { appointmentId, reason } = params;

  return apiClient<CancelAndRefundResponse>(
    `/appointments/${encodeURIComponent(appointmentId)}/cancel-refund`,
    {
      method: "POST",
      body: reason?.trim() ? { reason: reason.trim() } : {},
    },
  );
}
