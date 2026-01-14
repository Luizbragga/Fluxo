// src/notifications/notifications.controller.ts
import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SmsService } from './sms.service';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // ajuste o path se necessário

class SendTestSmsDto {
  @Matches(/^\+\d{8,15}$/, {
    message: 'Telefone deve estar em E.164. Ex: +3519XXXXXXXX',
  })
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private getAuthContext(req: any) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.sub ?? req.user?.userId;

    if (!tenantId || !userId) {
      throw new UnauthorizedException(
        'Token inválido ou contexto ausente (tenantId/userId).',
      );
    }

    return { tenantId, userId };
  }

  // -------------------------
  // TESTE SMS (mantém)
  // -------------------------
  @Post('sms/test')
  async sendTestSms(@Body() dto: SendTestSmsDto) {
    const body = dto.body ?? 'Teste Fluxo ✅';
    await this.smsService.sendSms(dto.to, body);
    return { ok: true };
  }

  // -------------------------
  // MINHAS NOTIFICAÇÕES (REAL)
  // -------------------------
  @Get('me')
  async myNotifications(@Req() req: any) {
    const { tenantId, userId } = this.getAuthContext(req);
    return this.notificationsService.listMyNotifications(tenantId, userId);
  }

  @Patch('me/read-all')
  async markAllAsRead(@Req() req: any) {
    const { tenantId, userId } = this.getAuthContext(req);
    return this.notificationsService.markAllAsRead(tenantId, userId);
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const { tenantId, userId } = this.getAuthContext(req);
    return this.notificationsService.markAsRead(tenantId, userId, id);
  }

  // -------------------------
  // FALLBACKS (compat front)
  // -------------------------
  // mantém esse fallback porque teu front tenta /notifications
  @Get()
  async listNotificationsFallback(@Req() req: any) {
    const { tenantId, userId } = this.getAuthContext(req);
    return this.notificationsService.listMyNotifications(tenantId, userId);
  }

  // mantém esse fallback porque teu front tenta PATCH /notifications/:id
  @Patch(':id')
  async patchNotificationFallback(@Req() req: any, @Param('id') id: string) {
    const { tenantId, userId } = this.getAuthContext(req);
    return this.notificationsService.markAsRead(tenantId, userId, id);
  }
}
