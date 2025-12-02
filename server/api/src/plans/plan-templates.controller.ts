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
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { PlanTemplatesService } from './plan-templates.service';
import { CreatePlanTemplateDto } from './dto/create-plan-template.dto';
import { UpdatePlanTemplateDto } from './dto/update-plan-template.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Plan Templates')
@ApiBearerAuth()
// garante que req.user esteja preenchido
@UseGuards(JwtAuthGuard, RolesGuard)
// por enquanto deixei só owner/admin com permissão
@Roles(Role.owner, Role.admin)
// ⚠️ sem "v1" aqui – o prefix global já adiciona
@Controller('plan-templates')
export class PlanTemplatesController {
  constructor(private readonly planTemplatesService: PlanTemplatesService) {}

  private getTenantIdFromReq(req: any): string {
    const tenantId = req.user?.tenantId ?? req.user?.tenant?.id;
    if (!tenantId) {
      throw new ForbiddenException('Tenant não encontrado no token');
    }
    return tenantId;
  }

  // POST /v1/plan-templates ---------------------------------------------------
  @Post()
  @ApiOperation({
    summary: 'Criar template de plano',
    description:
      'Cria um plano base (ex: "Plano barba + cabelo 15/15 dias") vinculado a uma location.',
  })
  create(@Req() req: any, @Body() dto: CreatePlanTemplateDto) {
    const tenantId = this.getTenantIdFromReq(req);
    return this.planTemplatesService.create(tenantId, dto);
  }

  // GET /v1/plan-templates ----------------------------------------------------
  @Get()
  @ApiOperation({
    summary: 'Listar templates de plano',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    description: 'Filtrar por locationId (cuid/uuid)',
  })
  findAll(@Req() req: any, @Query('locationId') locationId?: string) {
    const tenantId = this.getTenantIdFromReq(req);
    return this.planTemplatesService.findAll(tenantId, locationId);
  }
  // GET /v1/plan-templates/by-service/:serviceId -----------------------------
  @Get('by-service/:serviceId')
  @ApiOperation({
    summary: 'Listar planos que usam um determinado serviço',
  })
  findByService(@Req() req: any, @Param('serviceId') serviceId: string) {
    const tenantId = this.getTenantIdFromReq(req);
    return this.planTemplatesService.findByService(tenantId, serviceId);
  }

  // GET /v1/plan-templates/:id -----------------------------------------------
  @Get(':id')
  @ApiOperation({
    summary: 'Buscar um template de plano por ID',
  })
  findOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantIdFromReq(req);
    return this.planTemplatesService.findOne(tenantId, id);
  }

  // PATCH /v1/plan-templates/:id ---------------------------------------------
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar template de plano',
  })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePlanTemplateDto,
  ) {
    const tenantId = this.getTenantIdFromReq(req);
    return this.planTemplatesService.update(tenantId, id, dto);
  }

  // DELETE /v1/plan-templates/:id --------------------------------------------
  @Delete(':id')
  @ApiOperation({
    summary: 'Remover template de plano',
    description:
      'Remove o template. Depois podemos trocar para soft-delete se fizer sentido.',
  })
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantIdFromReq(req);
    return this.planTemplatesService.remove(tenantId, id);
  }
}
