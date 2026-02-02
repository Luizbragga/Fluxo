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
    const rawProvider = (this.config.get<string>('SMS_PROVIDER') || 'mock')
      .trim()
      .toLowerCase();

    this.provider = rawProvider === 'twilio' ? 'twilio' : 'mock';

    // ✅ Se for mock, NÃO exige env nenhuma e NÃO inicializa Twilio
    if (this.provider === 'mock') {
      this.logger.log('[SMS] provider=mock (Twilio desativado)');
      return;
    }

    // ✅ Só chega aqui se SMS_PROVIDER=twilio
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const messagingServiceSid = this.config.getOrThrow<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );

    const apiKeySid = this.config.get<string>('TWILIO_API_KEY_SID');
    const apiKeySecret = this.config.get<string>('TWILIO_API_KEY_SECRET');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    this.messagingServiceSid = messagingServiceSid;

    // Prioridade: API Key
    if (apiKeySid && apiKeySecret) {
      this.client = twilio(apiKeySid, apiKeySecret, { accountSid });
      this.logger.log('[SMS] provider=twilio (api key)');
      return;
    }

    // Fallback: Auth Token
    if (authToken) {
      this.client = twilio(accountSid, authToken);
      this.logger.log('[SMS] provider=twilio (auth token)');
      return;
    }

    throw new Error(
      'Twilio env faltando: informe (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET) OU TWILIO_AUTH_TOKEN',
    );
  }

  async sendSms(to: string, body: string) {
    // mock: nunca falha o fluxo do sistema
    if (this.provider === 'mock') {
      this.logger.log(`[SMS:mock] to=${to} body="${body}"`);
      return;
    }

    // twilio: valida se foi inicializado
    if (!this.client || !this.messagingServiceSid) {
      this.logger.warn('[SMS] Twilio não inicializado corretamente.');
      return;
    }

    await this.client.messages.create({
      to,
      body,
      messagingServiceSid: this.messagingServiceSid,
    });
  }
}
