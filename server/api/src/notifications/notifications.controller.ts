import { Body, Controller, Post, Get, Patch, Param } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SmsService } from './sms.service';

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

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('sms/test')
  async sendTestSms(@Body() dto: SendTestSmsDto) {
    const body = dto.body ?? 'Teste Fluxo ✅';
    await this.smsService.sendSms(dto.to, body);
    return { ok: true };
  }
  @Get('me')
  async myNotifications() {
    // MVP: ainda sem persistência -> retorna vazio
    return [];
  }

  @Get()
  async listNotifications() {
    // fallback do front
    return [];
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    // MVP: sem persistência
    return { ok: true, id };
  }

  @Patch(':id')
  async patchNotification(@Param('id') id: string) {
    // fallback do front (PATCH /notifications/:id com {read:true})
    return { ok: true, id };
  }
}
