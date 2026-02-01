import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private provider: 'mock' | 'twilio';
  private client?: Twilio;
  private messagingServiceSid?: string;

  constructor(private readonly config: ConfigService) {
    const p = (this.config.get<string>('SMS_PROVIDER') || 'mock').toLowerCase();
    this.provider = p === 'twilio' ? 'twilio' : 'mock';

    // ✅ Se não for twilio, não valida env nenhuma
    if (this.provider === 'mock') {
      this.logger.log('[SMS] Provider=mock (SMS desativado em dev)');
      return;
    }

    // ✅ Só valida Twilio quando provider=twilio
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const messagingServiceSid = this.config.get<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );

    const apiKeySid = this.config.get<string>('TWILIO_API_KEY_SID');
    const apiKeySecret = this.config.get<string>('TWILIO_API_KEY_SECRET');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !messagingServiceSid) {
      throw new Error(
        'Twilio env faltando: informe TWILIO_ACCOUNT_SID e TWILIO_MESSAGING_SERVICE_SID',
      );
    }

    this.messagingServiceSid = messagingServiceSid;

    // ✅ Prioridade: API Key (SK + secret)
    if (apiKeySid && apiKeySecret) {
      this.client = twilio(apiKeySid, apiKeySecret, { accountSid });
      this.logger.log('[SMS] Provider=twilio (api key)');
      return;
    }

    // ✅ fallback: Auth Token
    if (authToken) {
      this.client = twilio(accountSid, authToken);
      this.logger.log('[SMS] Provider=twilio (auth token)');
      return;
    }

    throw new Error(
      'Twilio env faltando: informe (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET) OU TWILIO_AUTH_TOKEN',
    );
  }

  async sendSms(to: string, body: string) {
    // ✅ mock: não quebra fluxo, só loga
    if (this.provider !== 'twilio') {
      this.logger.log(`[SMS:MOCK] to=${to} body="${body}"`);
      return { ok: true, provider: 'mock' as const };
    }

    // ✅ twilio: envia de verdade
    if (!this.client || !this.messagingServiceSid) {
      throw new Error('SmsService não inicializado corretamente (twilio).');
    }

    await this.client.messages.create({
      to,
      body,
      messagingServiceSid: this.messagingServiceSid,
    });

    return { ok: true, provider: 'twilio' as const };
  }
}
