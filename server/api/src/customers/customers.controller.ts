import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@ApiTags('Owner Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('owner/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Lista todos os "clientes" derivados dos agendamentos e planos
  @Roles(Role.owner, Role.admin)
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.customersService.listAll(user.tenantId);
  }
}
