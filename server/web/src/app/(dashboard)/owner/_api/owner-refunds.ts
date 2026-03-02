import { apiClient } from "@/lib/api-client";

export type RefundBookingPaymentPayload = {
  reason?: string;
};

export type RefundBookingPaymentResponse = {
  id: string;
  status: "refunded" | string;
  refundedAt?: string | null;
  stripePaymentIntentId?: string | null;
  amountCents?: number;
};

export async function refundOwnerBookingPayment(params: {
  appointmentId: string;
  reason?: string;
}) {
  const { appointmentId, reason } = params;

  return apiClient<RefundBookingPaymentResponse>(
    `/appointments/${encodeURIComponent(appointmentId)}/booking-payment/refund`,
    {
      method: "POST",
      body: reason ? ({ reason } satisfies RefundBookingPaymentPayload) : {},
    },
  );
}
