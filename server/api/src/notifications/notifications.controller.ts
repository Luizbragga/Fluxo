import { Body, Controller, Post } from '@nestjs/common';
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
}
