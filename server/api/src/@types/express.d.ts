import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      sub: string; // userId
      tenantId: string;
      locationId?: string | null;
      role: UserRole;
    }
  }
}

export {};
