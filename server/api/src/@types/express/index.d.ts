import 'express';

declare global {
  namespace Express {
    interface User {
      sub: string;
      tenantId: string;
      locationId?: string | null;
      roles?: string[];
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
