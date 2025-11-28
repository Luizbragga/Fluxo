import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('Services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  // Cria serviço (apenas owner/admin do tenant)
  @Roles(Role.owner, Role.admin)
  @Post()
  create(@Req() req: Request, @Body() dto: CreateServiceDto) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.create(tenantId, dto);
  }

  // Lista serviços do tenant com paginação + filtro opcional por location
  @Get()
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Número da página (começa em 1)',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    example: 20,
    description: 'Itens por página (máx. 100)',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    description: 'Filtra serviços por location (cuid/uuid)',
  })
  findAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('locationId') locationId?: string,
  ) {
    const tenantId = (req as any).user?.tenantId as string;

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize) || 20));

    return this.services.findAll(tenantId, {
      page: pageNum,
      pageSize: pageSizeNum,
      locationId: locationId || undefined,
    });
  }

  // Busca por ID (escopo do tenant)
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.findOne(tenantId, id);
  }

  // Atualiza serviço (apenas owner/admin)
  @Roles(Role.owner, Role.admin)
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.update(tenantId, id, dto);
  }

  // “Delete” (por enquanto soft delete)
  @Roles(Role.owner, Role.admin)
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.remove(tenantId, id);
  }
}
