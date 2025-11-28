import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CustomerPlansService } from './customer-plans.service';
import { CreateCustomerPlanDto } from './dto/create-customer-plan.dto';
import { UpdateCustomerPlanDto } from './dto/update-customer-plan.dto';
import { RegisterCustomerPlanPaymentDto } from './dto/register-customer-plan-payment.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Customer Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.owner, Role.admin)
// de novo: sem "v1" aqui
@Controller('plans/customer-plans')
export class CustomerPlansController {
  constructor(private readonly customerPlansService: CustomerPlansService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerPlanDto) {
    return this.customerPlansService.create(user.tenantId, dto);
  }

  @Get()
  @ApiQuery({ name: 'locationId', required: false })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.customerPlansService.findAll(user.tenantId, locationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customerPlansService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerPlanDto,
  ) {
    return this.customerPlansService.update(user.tenantId, id, dto);
  }
  @Patch(':id/pay')
  registerPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RegisterCustomerPlanPaymentDto,
  ) {
    return this.customerPlansService.registerPayment(user.tenantId, id, dto);
  }
}
