import type { UserRole } from '@dokanwala/shared';

export interface AuthContext {
  userId: string;
  shopId: string;
  role: UserRole;
  sessionId: string;
  deviceId?: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
    }
  }
}

export {};
