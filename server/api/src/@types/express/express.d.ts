import 'express';

declare global {
  namespace Express {
    interface User {
      sub: string;
      tenantId: string;
      locationId?: string | null;
      roles?: string[]; // ajusta pro teu RBAC real se for enum
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
