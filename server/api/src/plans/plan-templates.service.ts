import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanTemplateDto } from './dto/create-plan-template.dto';
import { UpdatePlanTemplateDto } from './dto/update-plan-template.dto';

@Injectable()
export class PlanTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // CREATE --------------------------------------------------------------------
  async create(tenantId: string, dto: CreatePlanTemplateDto) {
    // garantir que a location pertence ao tenant
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true },
    });

    if (!location) {
      throw new BadRequestException(
        'locationId inválido ou não pertence a este tenant.',
      );
    }

    return this.prisma.planTemplate.create({
      data: {
        tenantId,
        locationId: dto.locationId,
        name: dto.name,
        description: dto.description ?? null,
        priceCents: dto.priceCents,
        intervalDays: dto.intervalDays, // vamos enviar sempre 30 do front
        visitsPerInterval: dto.visitsPerInterval ?? 1,
        sameDayServiceIds: dto.sameDayServiceIds ?? [],
        allowedWeekdays: dto.allowedWeekdays ?? [],
        minDaysBetweenVisits: dto.minDaysBetweenVisits ?? null,
      },
    });
  }

  // LISTAR TODOS (por tenant, opcionalmente por location) ---------------------
  async findAll(tenantId: string, locationId?: string) {
    return this.prisma.planTemplate.findMany({
      where: {
        tenantId,
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  // DETALHE -------------------------------------------------------------------
  async findOne(tenantId: string, id: string) {
    const plan = await this.prisma.planTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado para este tenant.');
    }

    return plan;
  }

  // UPDATE --------------------------------------------------------------------
  async update(tenantId: string, id: string, dto: UpdatePlanTemplateDto) {
    const existing = await this.prisma.planTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Plano não encontrado para este tenant.');
    }

    const data: any = {
      name: dto.name,
      description: dto.description,
      priceCents: dto.priceCents,
      intervalDays: dto.intervalDays,
      visitsPerInterval: dto.visitsPerInterval,
      sameDayServiceIds: dto.sameDayServiceIds,
      allowedWeekdays: dto.allowedWeekdays,
      minDaysBetweenVisits: dto.minDaysBetweenVisits,
    };

    if (dto.locationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { id: true },
      });

      if (!loc) {
        throw new BadRequestException(
          'locationId inválido ou não pertence a este tenant.',
        );
      }

      data.locationId = dto.locationId;
    }

    // remove campos undefined pra não sobrescrever à toa
    Object.keys(data).forEach((key) => {
      if (data[key] === undefined) delete data[key];
    });

    return this.prisma.planTemplate.update({
      where: { id },
      data,
    });
  }

  // DELETE --------------------------------------------------------------------
  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.planTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Plano não encontrado para este tenant.');
    }

    await this.prisma.planTemplate.delete({ where: { id } });

    return { id };
  }
}
