import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { UpsertProviderCommissionDto } from './dto/upsert-provider-commission.dto';
import { Prisma, Role, Specialty, AppointmentState } from '@prisma/client';
import { CreateOwnerProviderDto } from './dto/create-owner-provider.dto';
import * as bcrypt from 'bcrypt';

// Tipo helper: Provider + user + location completos
type ProviderWithUserAndLocation = Prisma.ProviderGetPayload<{
  include: {
    user: true;
    location: true;
  };
}>;

/** Converte 'HH:mm' -> minutos desde 00:00 */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Converte minutos -> 'HH:mm' com zero-left */
function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Subtrai uma lista de blocos (em minutos) de uma lista de intervalos (em minutos) */
function subtractBlocks(
  intervals: { start: number; end: number }[],
  blocks: { start: number; end: number }[],
): { start: number; end: number }[] {
  let result = [...intervals];

  for (const b of blocks) {
    const next: { start: number; end: number }[] = [];

    for (const it of result) {
      // sem interseção: mantém
      if (b.end <= it.start || b.start >= it.end) {
        next.push(it);
        continue;
      }

      // há interseção: recorta em até duas partes
      if (b.start > it.start) {
        next.push({
          start: it.start,
          end: Math.max(it.start, Math.min(b.start, it.end)),
        });
      }

      if (b.end < it.end) {
        next.push({
          start: Math.min(Math.max(b.end, it.start), it.end),
          end: it.end,
        });
      }
    }

    result = next;
  }

  // remove fragmentos vazios/invertidos
  return result.filter((r) => r.end - r.start > 0);
}

/** Mescla ranges sobrepostos/colados (minutos) */
function mergeRanges(ranges: { start: number; end: number }[]) {
  if (ranges.length === 0) return [];
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [ordered[0]];

  for (let i = 1; i < ordered.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ordered[i];

    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  return merged;
}

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * View model seguro para retornar para o cliente:
   * - remove passwordHash
   * - devolve apenas os campos úteis do user/location
   */
  private toViewModel(provider: ProviderWithUserAndLocation) {
    const { user, location, ...rest } = provider;

    const safeUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
        }
      : null;

    const safeLocation = location
      ? {
          id: location.id,
          tenantId: location.tenantId,
          name: location.name,
          slug: location.slug,
          address: location.address,
          businessHoursTemplate: location.businessHoursTemplate ?? null,
          createdAt: location.createdAt,
          updatedAt: location.updatedAt,
        }
      : null;

    return {
      ...rest,
      user: safeUser,
      location: safeLocation,
    };
  }

  // cria provider garantindo que user e location pertencem ao mesmo tenant
  async create(tenantId: string, dto: CreateProviderDto) {
    // 1) valida se a location pertence ao mesmo tenant
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true, businessHoursTemplate: true },
    });

    if (!location) {
      throw new BadRequestException('locationId inválido para este tenant');
    }

    // 2) resolver o user: pode vir userId OU (email + phone)
    let userId: string;

    if (dto.userId) {
      // fluxo antigo: usar um usuário já existente
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: {
          id: true,
          tenantId: true,
          provider: { select: { id: true } },
        },
      });

      if (!user || user.tenantId !== tenantId) {
        throw new BadRequestException('userId inválido para este tenant');
      }

      if (user.provider) {
        throw new BadRequestException(
          'Este usuário já está vinculado a um provider',
        );
      }

      userId = user.id;
    } else {
      // fluxo novo: criar / reutilizar utilizador a partir do email
      if (!dto.email) {
        throw new BadRequestException(
          'É necessário informar "userId" OU "email" para criar o profissional.',
        );
      }

      const existingUser = await this.prisma.user.findFirst({
        where: { tenantId, email: dto.email },
        select: {
          id: true,
          provider: { select: { id: true } },
        },
      });

      if (existingUser) {
        if (existingUser.provider) {
          throw new BadRequestException(
            'Já existe um utilizador com este email vinculado a outro profissional.',
          );
        }

        userId = existingUser.id;
      } else {
        // cria um novo user com role=provider e senha aleatória
        const randomPassword = Math.random().toString(36).slice(-10);
        const passwordHash = await bcrypt.hash(randomPassword, 10);

        const newUser = await this.prisma.user.create({
          data: {
            tenantId,
            locationId: dto.locationId,
            role: Role.provider,
            name: dto.name,
            email: dto.email,
            phone: dto.phone ?? null,
            passwordHash,
            active: true,
          },
          select: { id: true },
        });

        userId = newUser.id;
      }
    }

    // 3) cria o provider em si
    const provider = await this.prisma.provider.create({
      data: {
        tenantId,
        userId,
        locationId: dto.locationId,
        name: dto.name,
        specialty: dto.specialty ?? 'other',
        weekdayTemplate: dto.weekdayTemplate ?? undefined,
        active: dto.active ?? true,
      },
      include: {
        user: true,
        location: true,
      },
    });

    return this.toViewModel(provider);
  }

  async findAll(
    tenantId: string,
    params?: { page?: number; pageSize?: number },
  ) {
    // valores padrão seguros
    const page = params?.page && params.page > 0 ? params.page : 1;

    const pageSize =
      params?.pageSize && params.pageSize > 0 && params.pageSize <= 100
        ? params.pageSize
        : 20;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [items, total] = await Promise.all([
      this.prisma.provider.findMany({
        where: { tenantId, active: true },
        include: {
          user: true,
          location: true,
        },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.provider.count({
        where: { tenantId, active: true },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: items.map((row) =>
        this.toViewModel(row as ProviderWithUserAndLocation),
      ),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, tenantId },
      include: {
        user: true,
        location: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider não encontrado');
    }

    return this.toViewModel(provider as ProviderWithUserAndLocation);
  }

  async getMe(tenantId: string, userId: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { tenantId, userId },
      include: { user: true, location: true },
    });

    if (!provider) {
      throw new NotFoundException(
        'Usuário autenticado não está vinculado a um provider neste tenant',
      );
    }

    return this.toViewModel(provider as ProviderWithUserAndLocation);
  }

  async update(tenantId: string, id: string, dto: UpdateProviderDto) {
    // garante pertença ao tenant e já carrega user para validar email
    const exists = await this.prisma.provider.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        userId: true,
        locationId: true,
        user: { select: { id: true, email: true } },
      },
    });

    if (!exists) {
      throw new NotFoundException('Provider não encontrado');
    }

    // se trocar userId, validar vínculo/tenant
    if (dto.userId && dto.userId !== exists.userId) {
      // segurança: não deixa trocar userId e editar email/phone ao mesmo tempo
      if (dto.email || dto.phone) {
        throw new BadRequestException(
          'Não é permitido editar email/telefone ao trocar userId do provider.',
        );
      }

      const u = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: {
          id: true,
          tenantId: true,
          provider: { select: { id: true } },
        },
      });

      if (!u || u.tenantId !== tenantId) {
        throw new BadRequestException('userId inválido para este tenant');
      }

      if (u.provider) {
        throw new BadRequestException(
          'Este usuário já está vinculado a um provider',
        );
      }
    }

    // se trocar locationId, validar que pertence ao mesmo tenant
    if (dto.locationId && dto.locationId !== exists.locationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { id: true },
      });

      if (!loc) {
        throw new BadRequestException('locationId inválido para este tenant');
      }
    }

    // ✅ valida email único no tenant (email fica no User)
    if (dto.email && dto.email !== (exists.user?.email ?? null)) {
      const emailInUse = await this.prisma.user.findFirst({
        where: {
          tenantId,
          email: dto.email,
          NOT: { id: exists.userId },
        },
        select: { id: true },
      });

      if (emailInUse) {
        throw new BadRequestException(
          'Já existe um utilizador com este email neste tenant',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1) atualiza o User vinculado (name/email/phone/locationId) se vierem
      if (
        exists.userId &&
        (dto.name ||
          dto.email ||
          dto.phone ||
          dto.locationId ||
          dto.active !== undefined ||
          dto.newPassword)
      ) {
        await tx.user.update({
          where: { id: exists.userId },
          data: {
            name: dto.name ?? undefined,
            email: dto.email ?? undefined,
            phone: dto.phone ?? undefined,
            locationId: dto.locationId ?? undefined,
            active: dto.active ?? undefined,
            passwordHash: dto.newPassword
              ? await bcrypt.hash(dto.newPassword, 10)
              : undefined,
          },
        });

        // invalida sessões antigas quando muda senha
        if (dto.newPassword) {
          await tx.refreshToken.deleteMany({
            where: { userId: exists.userId },
          });
        }
      }

      // 2) atualiza o Provider
      return tx.provider.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          userId: dto.userId ?? undefined,
          locationId: dto.locationId ?? undefined,
          specialty: dto.specialty ?? undefined,
          weekdayTemplate: dto.weekdayTemplate ?? undefined,
          active: dto.active ?? undefined,
        },
        include: {
          user: true,
          location: true,
        },
      });
    });

    return this.toViewModel(updated as ProviderWithUserAndLocation);
  }

  async remove(tenantId: string, id: string) {
    const exists = await this.prisma.provider.findFirst({
      where: { id, tenantId },
    });

    if (!exists) {
      throw new NotFoundException('Provider não encontrado');
    }

    await this.prisma.provider.delete({ where: { id } });

    return { ok: true };
  }

  async getDayAvailability(params: {
    tenantId: string;
    providerId: string;
    dateISO: string; // formato YYYY-MM-DD ou ISO completo; usaremos só a data UTC
  }) {
    const { tenantId, providerId, dateISO } = params;

    // 1) Provider do tenant (e ativo)
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: {
        id: true,
        weekdayTemplate: true,
        active: true,
        tenantId: true,
        location: {
          select: {
            businessHoursTemplate: true,
          },
        },
      },
    });

    if (!provider) throw new NotFoundException('Provider não encontrado');
    if (!provider.active) throw new BadRequestException('Provider inativo');

    // 2) Janela do dia (UTC)
    const date = new Date(dateISO);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('dateISO inválido; use YYYY-MM-DD');
    }

    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const d = date.getUTCDate();

    const dayStart = new Date(Date.UTC(y, m, d, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59));

    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdayKey = keyMap[dayStart.getUTCDay()];

    // 3) Intervalos de template (HH:mm) -> minutos no dia
    const baseTemplate =
      (provider.weekdayTemplate as Record<string, [string, string][]> | null) ??
      ((provider.location?.businessHoursTemplate ?? null) as Record<
        string,
        [string, string][]
      > | null) ??
      {};

    const rawIntervals = baseTemplate[weekdayKey] ?? [];

    const dayIntervals = rawIntervals
      .map(([start, end]) => {
        const s = toMin(start);
        const e = toMin(end);
        return { start: Math.max(0, s), end: Math.min(24 * 60, e) };
      })
      .filter((r) => r.end > r.start);

    if (dayIntervals.length === 0) {
      return {
        providerId,
        date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(
          2,
          '0',
        )}`,
        weekday: weekdayKey,
        intervals: [],
      };
    }

    // 4) Blocks que sobrepõem o dia
    const blocks = await this.prisma.block.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    // 5) Appointments (ignora cancelados) que sobrepõem o dia
    const appts = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        status: { not: AppointmentState.cancelled },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    // 6) Ambos convertidos para minutos no dia
    const toRangeMin = (s: Date, e: Date) => ({
      start: Math.max(
        0,
        Math.floor((s.getTime() - dayStart.getTime()) / 60000),
      ),
      end: Math.min(
        24 * 60,
        Math.ceil((e.getTime() - dayStart.getTime()) / 60000),
      ),
    });

    const takenRaw = [
      ...blocks.map((b) => toRangeMin(b.startAt, b.endAt)),
      ...appts.map((a) => toRangeMin(a.startAt, a.endAt)),
    ].filter((r) => r.end > r.start);

    // 7) Mescla ranges ocupados sobrepostos para recorte mais limpo
    const taken = mergeRanges(takenRaw);

    // 8) Subtrai ocupados (blocks + appts) dos livres do template
    const free = subtractBlocks(dayIntervals, taken);

    // 9) Retorno em HH:mm
    return {
      providerId,
      date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(
        2,
        '0',
      )}`,
      weekday: weekdayKey,
      intervals: free.map((r) => ({
        start: toHHMM(r.start),
        end: toHHMM(r.end),
      })),
    };
  }

  async getDaySlots(params: {
    tenantId: string;
    providerId: string;
    serviceId: string; // para conhecer a duração (durationMin)
    dateISO: string; // 'YYYY-MM-DD'
  }) {
    const { tenantId, providerId, serviceId, dateISO } = params;

    // 0) Carrega provider + template (e horário da location) e o service (para durationMin)
    const [provider, service] = await Promise.all([
      this.prisma.provider.findFirst({
        where: { id: providerId, tenantId },
        select: {
          id: true,
          weekdayTemplate: true,
          active: true,
          location: {
            select: {
              businessHoursTemplate: true,
            },
          },
        },
      }),
      this.prisma.service.findFirst({
        where: { id: serviceId, tenantId },
        select: {
          id: true,
          durationMin: true,
          active: true,
        },
      }),
    ]);

    if (!provider || !provider.active) {
      throw new Error('Provider não encontrado ou inativo');
    }

    if (!service || !service.active) {
      throw new Error('Service não encontrado ou inativo');
    }

    const duration = service.durationMin; // minutos

    // 1) Determina o dia/limites (UTC)
    const date = new Date(dateISO);

    if (isNaN(date.getTime())) {
      throw new Error('dateISO inválido');
    }

    const dayStart = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
      ),
    );

    const dayEnd = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
      ),
    );

    // 2) Intervalos do template para o dia
    const weekdayIndex = date.getUTCDay(); // 0..6
    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdayKey = keyMap[weekdayIndex];

    // Prioridade:
    // 1) weekdayTemplate específico do provider
    // 2) businessHoursTemplate da location
    const baseTemplate =
      (provider.weekdayTemplate as Record<string, [string, string][]> | null) ??
      ((provider.location?.businessHoursTemplate ?? null) as Record<
        string,
        [string, string][]
      > | null) ??
      {};

    const rawIntervals = (baseTemplate[weekdayKey] ?? []).map(
      ([start, end]) => ({
        start: toMin(start),
        end: toMin(end),
      }),
    );

    let free = rawIntervals;

    if (free.length === 0) {
      return {
        providerId,
        serviceId,
        date: dateISO,
        weekday: weekdayKey,
        slots: [] as { startAt: string; endAt: string }[],
      };
    }

    // 3) Blocks que toquem o dia
    const blocks = await this.prisma.block.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    const blockRanges = blocks.map((b) => {
      const s = Math.max(
        0,
        Math.floor((b.startAt.getTime() - dayStart.getTime()) / 60000),
      );
      const e = Math.min(
        24 * 60,
        Math.ceil((b.endAt.getTime() - dayStart.getTime()) / 60000),
      );
      return { start: s, end: e };
    });

    // Subtrai blocks do template
    free = subtractBlocks(free, blockRanges);

    if (free.length === 0) {
      return {
        providerId,
        serviceId,
        date: dateISO,
        weekday: weekdayKey,
        slots: [] as { startAt: string; endAt: string }[],
      };
    }

    // 4) Ocupações por appointments (≠ cancelled) que toquem o dia
    const appts = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        status: { not: AppointmentState.cancelled },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    const busyApptRanges = appts.map((a) => {
      const s = Math.max(
        0,
        Math.floor((a.startAt.getTime() - dayStart.getTime()) / 60000),
      );
      const e = Math.min(
        24 * 60,
        Math.ceil((a.endAt.getTime() - dayStart.getTime()) / 60000),
      );
      return { start: s, end: e };
    });

    // Subtrai agendamentos da disponibilidade restante
    free = subtractBlocks(free, busyApptRanges);

    // 5) Geração de slots (passo de 15 min), respeitando a duração do service
    const STEP = 15; // minutos
    const slots: { startAt: string; endAt: string }[] = [];

    for (const range of free) {
      for (let m = range.start; m + duration <= range.end; m += STEP) {
        const startMin = m;
        const endMin = m + duration;

        if (endMin <= range.end) {
          const startAt = new Date(
            dayStart.getTime() + startMin * 60000,
          ).toISOString();
          const endAt = new Date(
            dayStart.getTime() + endMin * 60000,
          ).toISOString();

          slots.push({ startAt, endAt });
        }
      }
    }

    return {
      providerId,
      serviceId,
      date: dateISO,
      weekday: weekdayKey,
      durationMin: duration,
      stepMin: STEP,
      slots,
    };
  }

  // ✅✅✅ ALTERADO: agora retorna TODOS os appointments do período (e totais só de DONE)
  async getMyEarnings(params: {
    tenantId: string;
    userId: string;
    from?: string;
    to?: string;
  }) {
    const { tenantId, userId, from, to } = params;

    // 1) Descobrir provider deste user
    const provider = await this.prisma.provider.findFirst({
      where: {
        tenantId,
        userId,
        active: true,
      },
      select: { id: true },
    });

    if (!provider) {
      throw new BadRequestException(
        'Usuário autenticado não está vinculado a um provider ativo neste tenant',
      );
    }

    // 2) Intervalo de datas
    const { fromDate, toDate } = this.resolveDateRange(from, to);

    // 3) Buscar TODOS appointments do período (done/cancelled/no_show/etc)
    //    e trazer "earning" quando existir (normalmente só em DONE)
    const appts = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId: provider.id,
        startAt: {
          gte: fromDate,
          lt: toDate,
        },
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        serviceName: true,
        servicePriceCents: true,
        earning: {
          select: {
            commissionPercentage: true,
            providerEarningsCents: true,
            houseEarningsCents: true,
          },
        },
      },
      orderBy: {
        startAt: 'asc',
      },
    });

    // 4) Totais financeiros SOMENTE em DONE
    let totalServicePriceCents = 0;
    let totalProviderEarningsCents = 0;
    let totalHouseEarningsCents = 0;

    for (const a of appts) {
      if (a.status === AppointmentState.done && a.earning) {
        totalServicePriceCents += a.servicePriceCents ?? 0;
        totalProviderEarningsCents += a.earning.providerEarningsCents ?? 0;
        totalHouseEarningsCents += a.earning.houseEarningsCents ?? 0;
      }
    }

    // 5) Payload no formato do teu FRONT
    const appointments = appts.map((a) => ({
      id: a.id,
      date: a.startAt.toISOString(),
      status: a.status,
      serviceName: a.serviceName,
      servicePriceCents: a.servicePriceCents ?? 0,
      commissionPercentage: a.earning?.commissionPercentage ?? 0,
      providerEarningsCents: a.earning?.providerEarningsCents ?? 0,
      houseEarningsCents: a.earning?.houseEarningsCents ?? 0,
    }));

    return {
      providerId: provider.id,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totals: {
        servicePriceCents: totalServicePriceCents,
        providerEarningsCents: totalProviderEarningsCents,
        houseEarningsCents: totalHouseEarningsCents,
      },
      appointments,
    };
  }

  async getProviderCommissions(tenantId: string, providerId: string) {
    // Garante que o provider pertence ao tenant
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider não encontrado');
    }

    const commissions = await this.prisma.providerCommission.findMany({
      where: { tenantId, providerId },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            durationMin: true,
            priceCents: true,
          },
        },
      },
      orderBy: [{ serviceId: 'asc' }, { createdAt: 'desc' }],
    });

    return commissions;
  }

  async upsertProviderCommission(params: {
    tenantId: string;
    providerId: string;
    dto: UpsertProviderCommissionDto;
  }) {
    const { tenantId, providerId, dto } = params;

    // valida provider do tenant
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider não encontrado');
    }

    // normaliza serviceId (undefined -> null)
    const serviceId = dto.serviceId ?? null;

    if (serviceId) {
      // valida service do mesmo tenant
      const service = await this.prisma.service.findFirst({
        where: { id: serviceId, tenantId },
        select: { id: true },
      });

      if (!service) {
        throw new BadRequestException('serviceId inválido para este tenant');
      }
    }

    // defesa extra (além do class-validator)
    if (dto.percentage < 0 || dto.percentage > 100) {
      throw new BadRequestException(
        'percentage deve estar entre 0 e 100 (inteiro)',
      );
    }

    // -------------------------
    // CASO 1: regra padrão (serviceId = null)
    // -------------------------
    if (!serviceId) {
      const existing = await this.prisma.providerCommission.findFirst({
        where: { tenantId, providerId, serviceId: null },
      });

      const include = {
        service: {
          select: {
            id: true,
            name: true,
            durationMin: true,
            priceCents: true,
          },
        },
      } as const;

      if (existing) {
        return this.prisma.providerCommission.update({
          where: { id: existing.id },
          data: {
            percentage: dto.percentage,
            active: dto.active ?? true,
          },
          include,
        });
      }

      return this.prisma.providerCommission.create({
        data: {
          tenantId,
          providerId,
          serviceId: null,
          percentage: dto.percentage,
          active: dto.active ?? true,
        },
        include,
      });
    }

    // -------------------------
    // CASO 2: regra específica por serviço (serviceId definido)
    // -------------------------
    const commission = await this.prisma.providerCommission.upsert({
      where: {
        tenantId_providerId_serviceId: {
          tenantId,
          providerId,
          serviceId, // aqui agora é sempre string, nunca null
        },
      },
      create: {
        tenantId,
        providerId,
        serviceId,
        percentage: dto.percentage,
        active: dto.active ?? true,
      },
      update: {
        percentage: dto.percentage,
        active: dto.active ?? true,
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            durationMin: true,
            priceCents: true,
          },
        },
      },
    });

    return commission;
  }

  private resolveDateRange(
    from?: string,
    to?: string,
  ): { fromDate: Date; toDate: Date } {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(
          'Parâmetro "from" inválido. Use uma data ISO 8601.',
        );
      }
      fromDate = d;
    }

    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(
          'Parâmetro "to" inválido. Use uma data ISO 8601.',
        );
      }
      toDate = d;
    }

    // Caso 1: nenhum dos dois informado -> mês atual (UTC)
    if (!fromDate && !toDate) {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();

      fromDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      toDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

      return { fromDate, toDate };
    }

    // Caso 2: veio só from -> intervalo de 31 dias
    if (fromDate && !toDate) {
      toDate = new Date(fromDate.getTime() + 31 * 24 * 60 * 60 * 1000);
    }

    // Caso 3: veio só to -> 31 dias antes
    if (!fromDate && toDate) {
      fromDate = new Date(toDate.getTime() - 31 * 24 * 60 * 60 * 1000);
    }

    // Aqui o TS sabe que os dois estão preenchidos
    if (!fromDate || !toDate) {
      throw new BadRequestException(
        'Não foi possível resolver o intervalo de datas.',
      );
    }

    if (fromDate >= toDate) {
      throw new BadRequestException('"from" deve ser menor que "to".');
    }

    return { fromDate, toDate };
  }

  /**
   * Lista utilizadores disponíveis para serem vinculados a um provider:
   * - mesmo tenant
   * - role = provider
   * - ativos
   * - ainda não têm provider associado
   */
  async findAvailableUsersForProvider(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: Role.provider,
        active: true,
        provider: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
      orderBy: { name: 'asc' },
    });

    return users;
  }

  /**
   * Fluxo simplificado para o dono:
   * - recebe nome, email, telefone, unidade, especialidade
   * - cria User (login) + Provider (profissional) numa transação
   */
  async createForOwner(tenantId: string, dto: CreateOwnerProviderDto) {
    // 1) validar location do tenant
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true, businessHoursTemplate: true },
    });

    if (!location) {
      throw new BadRequestException('locationId inválido para este tenant');
    }

    // 2) validar email único dentro do tenant
    const existingUser = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email: dto.email,
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException(
        'Já existe um utilizador com este email neste tenant',
      );
    }

    // 3) gerar uma password aleatória provisória e hash
    const randomPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    // 4) transação: cria User + Provider
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          locationId: dto.locationId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone ?? null,
          role: Role.provider,
          passwordHash,
          active: true,
        },
      });

      const provider = await tx.provider.create({
        data: {
          tenantId,
          userId: user.id,
          locationId: dto.locationId,
          name: dto.name,
          specialty: dto.specialty ?? Specialty.other,
          weekdayTemplate: dto.weekdayTemplate ?? undefined,
          active: true,
        },
        include: {
          user: true,
          location: true,
        },
      });

      return provider;
    });

    // TODO: no futuro -> enviar convite por email/whatsapp usando token

    return this.toViewModel(created as ProviderWithUserAndLocation);
  }
}
