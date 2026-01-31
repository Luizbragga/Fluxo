import { apiClient } from "@/lib/api-client";

export type CreatePublicCheckoutPayload = {
  serviceId: string;
  providerId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  customerName: string;
  customerPhone: string;

  // usado apenas quando policy = online_optional
  payOnline?: boolean;
};

export type CreatePublicCheckoutResponse = {
  ok: boolean;
  mode?: "stripe";
  checkoutUrl?: string;
  appointmentId?: string;
};

export async function createPublicCheckoutBySlug(params: {
  tenantSlug: string;
  locationSlug: string;
  payload: CreatePublicCheckoutPayload;
}) {
  const { tenantSlug, locationSlug, payload } = params;

  return apiClient<CreatePublicCheckoutResponse>(
    `/public/booking/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(
      locationSlug,
    )}/checkout`,
    {
      method: "POST",
      body: payload,
    },
  );
}
