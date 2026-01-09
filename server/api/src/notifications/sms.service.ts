import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private client: Twilio;
  private messagingServiceSid: string;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const messagingServiceSid = this.config.getOrThrow<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );

    const apiKeySid = this.config.get<string>('TWILIO_API_KEY_SID');
    const apiKeySecret = this.config.get<string>('TWILIO_API_KEY_SECRET');

    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    this.messagingServiceSid = messagingServiceSid;

    // ✅ Prioridade: API Key (SK + secret)
    if (apiKeySid && apiKeySecret) {
      this.client = twilio(apiKeySid, apiKeySecret, { accountSid });
      return;
    }

    // ✅ fallback: Auth Token (se tu quiser usar)
    if (authToken) {
      this.client = twilio(accountSid, authToken);
      return;
    }

    throw new Error(
      'Twilio env faltando: informe (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET) OU TWILIO_AUTH_TOKEN',
    );
  }

  async sendSms(to: string, body: string) {
    await this.client.messages.create({
      to,
      body,
      messagingServiceSid: this.messagingServiceSid,
    });
  }
}
