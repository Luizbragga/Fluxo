import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get('me')
  async me(@Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.tenants.getMe(tenantId);
  }
  @Get('settings')
  async getSettings(@Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.tenants.getSettings(tenantId);
  }

  @Patch('settings')
  async updateSettings(@Req() req: any, @Body() dto: UpdateTenantSettingsDto) {
    const tenantId = req.user?.tenantId as string;
    return this.tenants.updateSettings(tenantId, dto);
  }
}
