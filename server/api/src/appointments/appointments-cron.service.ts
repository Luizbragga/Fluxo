import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsCronService {
  private readonly logger = new Logger(AppointmentsCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda todos os dias às 03:00.
   *
   * Regra:
   * - Todo appointment com:
   *   - startAt ANTES de hoje 00:00
   *   - status ainda = "scheduled"
   *
   * vira automaticamente "no_show" (falta).
   *
   * Isso dá o dia inteiro pro barbeiro marcar como "done".
   * Passou da meia-noite sem atualizar → vira falta automática.
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
        status: 'scheduled', // ainda não marcado como concluído, falta ou cancelado
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
}
