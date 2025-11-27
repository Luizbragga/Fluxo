import { apiClient } from "./api-client";

export type CurrentUser = {
  id: string;
  tenantId: string;
  role: string; // depois podemos afinar para "owner" | "admin" | ...
};

type MeResponse = {
  user: CurrentUser;
};

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await apiClient<MeResponse>("/auth/me", {
    method: "POST",
  });

  return res.user;
}
