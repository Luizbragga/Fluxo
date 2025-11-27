import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';

import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // owner/admin criam locations
  @Roles(Role.owner, Role.admin)
  @Post()
  create(@Req() req: any, @Body() dto: CreateLocationDto) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.create(tenantId, dto);
  }

  // qualquer usuário interno lista locations paginadas
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get()
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Página (opcional, padrão 1)',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    example: 20,
    description: 'Itens por página (opcional, padrão 20, máx 100)',
  })
  findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.findAll(tenantId, { page, pageSize });
  }

  // qualquer interno lê uma location do tenant
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.findOne(tenantId, id);
  }

  // owner/admin atualizam location
  @Roles(Role.owner, Role.admin)
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.update(tenantId, id, dto);
  }

  // owner/admin desativam location (soft delete)
  @Roles(Role.owner, Role.admin)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.remove(tenantId, id);
  }
}
