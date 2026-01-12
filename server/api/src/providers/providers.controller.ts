import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';

import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { UpsertProviderCommissionDto } from './dto/upsert-provider-commission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateOwnerProviderDto } from './dto/create-owner-provider.dto';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  // owner/admin podem criar provider
  @Roles(Role.owner, Role.admin)
  @Post()
  create(@Req() req: any, @Body() dto: CreateProviderDto) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.create(tenantId, dto);
  }
  /**
   * Fluxo simplificado para o dono:
   * cria User (login) + Provider (profissional) de uma vez.
   */
  @Roles(Role.owner, Role.admin)
  @Post('owner-create')
  createForOwner(@Req() req: any, @Body() dto: CreateOwnerProviderDto) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.createForOwner(tenantId, dto);
  }

  // qualquer autenticado do tenant pode listar (com paginação)
  @Get()
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Página (>= 1)',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    example: 20,
    description: 'Registos por página (1–100)',
  })
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    const pageNum = page ? parseInt(page, 10) : undefined;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : undefined;

    return this.providersService.findAll(tenantId, {
      page: pageNum,
      pageSize: pageSizeNum,
    });
  }
  // owner/admin podem ver utilizadores disponíveis para virar provider
  @Roles(Role.owner, Role.admin)
  @Get('available-users')
  getAvailableUsers(@Req() req: any) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.findAvailableUsersForProvider(tenantId);
  }

  // provider autenticado pega o próprio profile (para o painel /provider)
  @Roles(Role.provider)
  @Get('me')
  me(@Req() req: any) {
    const { tenantId, id: userId } = req.user as {
      tenantId: string;
      id: string;
    };
    return this.providersService.getMe(tenantId, userId);
  }

  // qualquer autenticado do tenant pode ler um provider
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.findOne(tenantId, id);
  }

  // disponibilidade por dia (owner/admin/attendant/provider)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get(':id/availability')
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  async getAvailability(
    @Req() req: any,
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    const tenantId = req.user?.tenantId as string;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Param "date" deve ser YYYY-MM-DD');
    }

    return this.providersService.getDayAvailability({
      tenantId,
      providerId: id,
      dateISO: date,
    });
  }

  // slots reserváveis para um provider no dia, considerando a duração do service
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get(':id/slots')
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  @ApiQuery({
    name: 'serviceId',
    required: true,
    type: String,
    example: 'cmhvvsuip0006uyqsdne4267g',
    description: 'Service (cuid) para definir a duração do slot',
  })
  async getSlots(
    @Req() req: any,
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Param "date" deve ser YYYY-MM-DD');
    }

    // validação básica de cuid
    if (!/^c[a-z0-9]{24}$/i.test(serviceId)) {
      throw new BadRequestException(
        'Param "serviceId" deve ser um cuid válido',
      );
    }

    const tenantId = req.user?.tenantId as string;

    return this.providersService.getDaySlots({
      tenantId,
      providerId: id,
      serviceId,
      dateISO: date,
    });
  }

  // ganhos do provider autenticado (qualquer user que seja provider: owner/admin/provider)
  @Roles(Role.owner, Role.admin, Role.provider)
  @Get('me/earnings')
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2025-11-01T00:00:00.000Z',
    description:
      'Início do intervalo (ISO 8601). Se omitido, usa início do mês atual (UTC).',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2025-12-01T00:00:00.000Z',
    description:
      'Fim do intervalo (exclusivo, ISO 8601). Se omitido, assume ~31 dias após "from" ou fim do mês atual.',
  })
  getMyEarnings(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { tenantId, id: userId } = req.user as {
      tenantId: string;
      id: string;
    };

    return this.providersService.getMyEarnings({
      tenantId,
      userId,
      from,
      to,
    });
  }
  // owner/admin podem ver todas as regras de comissão de um provider
  @Roles(Role.owner, Role.admin)
  @Get(':id/commissions')
  getProviderCommissions(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.getProviderCommissions(tenantId, id);
  }

  // owner/admin podem criar/atualizar (upsert) regra de comissão de um provider
  @Roles(Role.owner, Role.admin)
  @Post(':id/commissions')
  upsertProviderCommission(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertProviderCommissionDto,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.providersService.upsertProviderCommission({
      tenantId,
      providerId: id,
      dto,
    });
  }

  // owner/admin podem atualizar provider
  @Roles(Role.owner, Role.admin)
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.update(tenantId, id, dto);
  }

  // owner/admin podem remover provider
  @Roles(Role.owner, Role.admin)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.remove(tenantId, id);
  }
}
