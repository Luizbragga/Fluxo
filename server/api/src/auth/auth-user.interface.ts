import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: Role;
  locationId?: string | null;
  reauthNonce?: number;
}
