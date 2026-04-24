import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

type AuthUser = {
  id?: string;
  userId?: string;
  tenantId?: string;
  role?: string;
};

type RequestWithMeta = Request & {
  requestId?: string;
  user?: AuthUser;
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithMeta>();
    const res = http.getResponse<Response>();

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;
          const user = req.user;
          const requestId = req.requestId ?? '-';
          const tenantId = user?.tenantId ?? 'public';
          const userId = user?.id ?? user?.userId ?? 'anonymous';
          const method = req.method;
          const path = req.originalUrl ?? req.url;
          const statusCode = res.statusCode;

          this.logger.log(
            `requestId=${requestId} tenantId=${tenantId} userId=${userId} method=${method} path=${path} status=${statusCode} durationMs=${durationMs}`,
          );
        },
        error: (error: unknown) => {
          const durationMs = Date.now() - startedAt;
          const user = req.user;
          const requestId = req.requestId ?? '-';
          const tenantId = user?.tenantId ?? 'public';
          const userId = user?.id ?? user?.userId ?? 'anonymous';
          const method = req.method;
          const path = req.originalUrl ?? req.url;
          const statusCode =
            typeof res?.statusCode === 'number' ? res.statusCode : 500;

          const message =
            error instanceof Error ? error.message : 'Unknown error';

          this.logger.error(
            `requestId=${requestId} tenantId=${tenantId} userId=${userId} method=${method} path=${path} status=${statusCode} durationMs=${durationMs} error=${message}`,
          );
        },
      }),
    );
  }
}
