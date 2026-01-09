import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { addHours, addMinutes } from 'date-fns';

@Injectable()
export class AppointmentsCronService {
  private readonly logger = new Logger(AppointmentsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Roda todos os dias às 03:00.
   *
   * Regra:
   * - Todo appointment com:
   *   - startAt ANTES de hoje 00:00
   *   - status ainda = "scheduled"
   *
   * vira automaticamente "no_show" (falta).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async markPastScheduledAsNoShow() {
    const now = new Date();

    // hoje às 00:00 (limite para considerar "ontem e antes")
    const todayMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );

    const result = await this.prisma.appointment.updateMany({
      where: {
        startAt: { lt: todayMidnight },
        status: 'scheduled',
      },
      data: {
        status: 'no_show',
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cron NO-SHOW: marcadas ${result.count} faltas automáticas.`,
      );
    }
  }

  /**
   * LEMBRETE DE APPOINTMENT POR SMS (CLIENTE)
   *
   * Regra:
   * - TenantSettings.clientRemindersEnabled = true
   * - Envia X horas antes (TenantSettings.reminderHoursBefore)
   * - Só para appointments:
   *   - status = "scheduled"
   *   - reminderSmsSentAt IS NULL
   *   - startAt dentro da "janela" do lembrete
   *
   * Janela (pra não depender do segundo exato):
   * - startAt >= now + hoursBefore
   * - startAt <  now + hoursBefore + WINDOW_MIN
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendClientReminders() {
    const now = new Date();
    this.logger.log(`[REMINDER TICK] ${now.toISOString()}`);

    const WINDOW_MIN = 5;

    // pega só tenants com lembrete ligado
    const tenants = await this.prisma.tenantSettings.findMany({
      where: { clientRemindersEnabled: true },
      select: { tenantId: true, reminderHoursBefore: true, timezone: true },
    });

    if (tenants.length === 0) return;

    let totalSent = 0;

    for (const t of tenants) {
      const hoursBefore = t.reminderHoursBefore ?? 24;
      const tz = t.timezone ?? 'Europe/Lisbon';

      // janela de START do appointment que corresponde ao momento do lembrete
      const windowStart = addHours(now, hoursBefore);
      const windowEnd = addMinutes(windowStart, WINDOW_MIN);

      const appointments = await this.prisma.appointment.findMany({
        where: {
          tenantId: t.tenantId,
          status: 'scheduled',
          reminderSmsSentAt: null,
          startAt: { gte: windowStart, lt: windowEnd },
        },
        select: {
          id: true,
          startAt: true,
          clientName: true,
          clientPhone: true,
          serviceName: true,
          provider: { select: { name: true } },
        },
      });

      for (const appt of appointments) {
        // "claim" pra não duplicar em execução concorrente
        const claimed = await this.prisma.appointment.updateMany({
          where: { id: appt.id, reminderSmsSentAt: null },
          data: { reminderSmsSentAt: now },
        });

        if (claimed.count === 0) continue;

        try {
          const to = (appt.clientPhone ?? '').trim();

          // Só envia se estiver em E.164 (+351.... etc)
          if (!/^\+\d{8,15}$/.test(to)) {
            this.logger.warn(
              `[REMINDER SMS] Telefone inválido (não E.164) appt=${appt.id} phone="${appt.clientPhone}"`,
            );

            // libera pra tentar de novo depois (caso corrija o telefone)
            await this.prisma.appointment.update({
              where: { id: appt.id },
              data: { reminderSmsSentAt: null },
            });
            continue;
          }

          const when = appt.startAt.toLocaleString('pt-PT', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          const msg =
            `Fluxo ⏰ Lembrete de agendamento\n` +
            `Cliente: ${appt.clientName}\n` +
            `Serviço: ${appt.serviceName}\n` +
            `Profissional: ${appt.provider?.name ?? '—'}\n` +
            `Data/Hora: ${when}`;

          await this.smsService.sendSms(to, msg);
          totalSent++;
        } catch (e) {
          this.logger.warn(
            `[REMINDER SMS] Falha ao enviar appt=${appt.id}: ${(e as any)?.message ?? e}`,
          );

          // falhou -> libera pra tentar de novo no próximo ciclo
          await this.prisma.appointment.update({
            where: { id: appt.id },
            data: { reminderSmsSentAt: null },
          });
        }
      }
    }

    if (totalSent > 0) {
      this.logger.log(`Cron REMINDER SMS: enviados ${totalSent} lembretes.`);
    }
  }
}
