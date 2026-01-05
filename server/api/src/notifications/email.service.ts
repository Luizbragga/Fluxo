import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !portRaw || !user || !pass) {
      // Não quebra o servidor agora — só avisa.
      // Quando a gente ligar no fluxo do agendamento, decidimos se falha ou se só loga.
      this.logger.warn(
        'SMTP não configurado (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS). EmailService ficará inativo até configurar.',
      );

      // cria um “transporter” dummy que sempre falha de forma controlada
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });

      return this.transporter;
    }

    const port = Number(portRaw);
    const secure = port === 465; // padrão SMTP SSL
    const from = process.env.MAIL_FROM;

    if (!from) {
      this.logger.warn(
        'MAIL_FROM não configurado. Defina MAIL_FROM (ex: "Fluxo <no-reply@teudominio.com>").',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    return this.transporter;
  }

  async send(input: SendEmailInput) {
    const from = process.env.MAIL_FROM || 'no-reply@fluxo.local';

    const transporter = this.getTransporter();

    const to = Array.isArray(input.to) ? input.to.join(', ') : input.to;

    // Se estiver em jsonTransport (smtp não configurado), isso não envia email real.
    // A gente vai ver isso claramente no log quando for testar.
    const info = await transporter.sendMail({
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    this.logger.log(`Email queued: to="${to}" subject="${input.subject}"`);
    return info;
  }
}
