import { apiClient } from "@/lib/api-client";

export type CreateInviteInput = {
  role: "admin" | "attendant" | "provider";
  specialty?:
    | "barber"
    | "hairdresser"
    | "nail"
    | "esthetic"
    | "makeup"
    | "tattoo"
    | "other";
  locationId?: string;
  expiresInHours?: number;
};

export type CreateInviteResponse = {
  invite: {
    id: string;
    tenantId: string;
    role: string;
    specialty: string | null;
    locationId: string | null;
    email: string | null;
    phone: string | null;
    expiresAt: string;
    createdAt: string;
    acceptedAt: string | null;
  };
  inviteUrl: string;
};

export async function createOwnerInvite(input: CreateInviteInput) {
  return apiClient<CreateInviteResponse>("/invites", {
    method: "POST",
    body: input,
  });
}
