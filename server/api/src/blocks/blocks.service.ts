import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

type CurrentUser = { id: string; role: string };

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cria um bloco garantindo:
   * - provider pertence ao tenant do usuário
   * - se user.role === "provider", só pode bloquear a própria agenda
   * - intervalo válido (start < end)
   * - sem sobreposição com outros blocks no mesmo provider
   * - sem conflito com appointments ativos (scheduled/in_service)
   */
  async create(tenantId: string, user: CurrentUser, dto: CreateBlockDto) {
    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, tenantId },
      select: { id: true, userId: true },
    });
    if (!provider) {
      throw new BadRequestException('providerId inválido para este tenant.');
    }

    // Se o usuário for "provider", só pode bloquear a própria agenda
    if (user.role === 'provider' && provider.userId !== user.id) {
      throw new ForbiddenException(
        'Sem permissão para bloquear a agenda de outro provider.',
      );
    }

    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (!(start < end)) {
      throw new BadRequestException('startAt deve ser menor que endAt.');
    }

    // Checa sobreposição com outros blocks
    const overlapBlocks = await this.prisma.block.count({
      where: {
        tenantId,
        providerId: provider.id,
        // (start < existing.end) AND (end > existing.start)
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (overlapBlocks > 0) {
      throw new BadRequestException('Intervalo conflita com outro bloqueio.');
    }

    // Checa conflito com appointments ativos
    const overlapAppointment = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: provider.id,
        startAt: { lt: end },
        endAt: { gt: start },
        status: { in: ['scheduled', 'in_service'] as any },
      },
      select: { id: true },
    });

    if (overlapAppointment) {
      throw new BadRequestException('Conflito com agendamento existente.');
    }

    return this.prisma.block.create({
      data: {
        tenantId,
        providerId: provider.id,
        startAt: start,
        endAt: end,
        reason: dto.reason ?? null,
      },
    });
  }

  /**
   * Atualiza um bloqueio garantindo:
   * - block pertence ao tenant
   * - provider só mexe no próprio block
   * - sem conflito com appointments
   * - sem conflito com outros blocks
   */
  async update(
    tenantId: string,
    user: CurrentUser,
    id: string,
    dto: UpdateBlockDto,
  ) {
    // 1) pegar o bloqueio e validar tenant
    const existing = await this.prisma.block.findUnique({
      where: { id },
      include: {
        provider: { select: { userId: true } },
      },
    });

    if (!existing || existing.tenantId !== tenantId) {
      throw new ForbiddenException('Block inválido para este tenant.');
    }

    // provider só pode alterar bloqueios da própria agenda
    if (user.role === 'provider' && existing.provider.userId !== user.id) {
      throw new ForbiddenException(
        'Sem permissão para alterar bloqueio de outro provider.',
      );
    }

    // 2) montar dados novos (mantendo o que não foi enviado)
    const startAtStr = dto.startAt ?? existing.startAt.toISOString();
    const endAtStr = dto.endAt ?? existing.endAt.toISOString();

    const startAt = new Date(startAtStr);
    const endAt = new Date(endAtStr);

    if (!(startAt < endAt)) {
      throw new BadRequestException('startAt deve ser anterior a endAt.');
    }

    // 3) validar conflitos com appointments do mesmo provider
    const overlapsAppointment = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: existing.providerId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        status: { in: ['scheduled', 'in_service'] as any },
      },
      select: { id: true },
    });

    if (overlapsAppointment) {
      throw new BadRequestException('Conflito com outro agendamento.');
    }

    // 4) validar conflitos com outros blocks
    const overlapBlock = await this.prisma.block.findFirst({
      where: {
        tenantId,
        providerId: existing.providerId,
        id: { not: id },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });

    if (overlapBlock) {
      throw new BadRequestException('Conflito com outro bloqueio.');
    }

    // 5) persistir
    return this.prisma.block.update({
      where: { id },
      data: {
        startAt,
        endAt,
        reason: dto.reason ?? existing.reason,
      },
    });
  }

  /**
   * Remove um bloco garantindo:
   * - pertence ao tenant
   * - provider só pode remover bloqueios próprios
   */
  async remove(tenantId: string, user: CurrentUser, id: string) {
    const found = await this.prisma.block.findFirst({
      where: { id, tenantId },
      include: {
        provider: { select: { userId: true } },
      },
    });

    if (!found) {
      throw new NotFoundException('Block não encontrado.');
    }

    if (user.role === 'provider' && found.provider.userId !== user.id) {
      throw new ForbiddenException(
        'Sem permissão para remover bloqueio de outro provider.',
      );
    }

    await this.prisma.block.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Lista blocks de um provider em um determinado dia
   * - valida providerId do tenant
   * - provider só vê a própria agenda
   */
  async listByProviderAndDate(
    tenantId: string,
    user: CurrentUser,
    providerId: string,
    dateISO: string,
  ) {
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, userId: true },
    });

    if (!provider) {
      throw new BadRequestException('providerId inválido para este tenant.');
    }

    if (user.role === 'provider' && provider.userId !== user.id) {
      throw new ForbiddenException(
        'Sem permissão para visualizar bloqueios de outro provider.',
      );
    }

    const day = new Date(dateISO);
    const next = new Date(day);
    next.setUTCDate(day.getUTCDate() + 1);

    return this.prisma.block.findMany({
      where: {
        tenantId,
        providerId: provider.id,
        startAt: { lt: next },
        endAt: { gt: day },
      },
      orderBy: { startAt: 'asc' },
    });
  }
}
