// src/notifications/notifications.service.ts
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CreateNotificationInput = {
  tenantId: string;
  userId: string;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  data?: unknown;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    if (!input?.tenantId) {
      throw new BadRequestException('tenantId é obrigatório para notificação.');
    }
    if (!input?.userId) {
      throw new BadRequestException('userId é obrigatório para notificação.');
    }

    return this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type ?? null,
        title: input.title ?? null,
        message: input.message ?? null,
        // Para JSON: undefined = não seta; null = seta null
        data: input.data ?? undefined,
      },
    });
  }

  async listMyNotifications(tenantId: string, userId: string) {
    if (!tenantId) throw new BadRequestException('tenantId ausente.');
    if (!userId) throw new BadRequestException('userId ausente.');

    return this.prisma.notification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async markAsRead(tenantId: string, userId: string, notificationId: string) {
    if (!tenantId) throw new BadRequestException('tenantId ausente.');
    if (!userId) throw new BadRequestException('userId ausente.');
    if (!notificationId)
      throw new BadRequestException('notificationId ausente.');

    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, tenantId: true, userId: true, readAt: true },
    });

    if (!n) throw new NotFoundException('Notificação não encontrada.');
    if (n.tenantId !== tenantId || n.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta notificação.');
    }

    if (n.readAt) return { ok: true };

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return { ok: true };
  }

  async markAllAsRead(tenantId: string, userId: string) {
    if (!tenantId) throw new BadRequestException('tenantId ausente.');
    if (!userId) throw new BadRequestException('userId ausente.');

    await this.prisma.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { ok: true };
  }
}
