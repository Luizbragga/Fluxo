import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';

import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, CustomerPlanPaymentStatus } from '@prisma/client';
import { ProviderPayoutsQueryDto } from './dto/provider-payouts-query.dto';
import { AppointmentsOverviewQueryDto } from './dto/appointments-overview-query.dto';
import { ServicesReportQueryDto } from './dto/services-report-query.dto';
import type { Request } from 'express';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(Role.owner, Role.admin)
  @Get('provider-earnings')
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2025-11-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2025-12-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    example: 'cmi8loc0000...',
  })
  @ApiQuery({
    name: 'providerId',
    required: false,
    type: String,
    example: 'cmi8prov0000...',
  })
  getProviderEarnings(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
    @Query('providerId') providerId?: string,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getProviderEarnings({
      tenantId,
      from,
      to,
      locationId,
      providerId,
    });
  }

  @Roles(Role.owner, Role.admin)
  @Get('provider-payouts')
  async getProviderPayouts(
    @Req() req: Request,
    @Query() query: ProviderPayoutsQueryDto,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getProviderPayouts(tenantId, query);
  }
  @Roles(Role.owner, Role.admin)
  @Patch('provider-payouts/provider/:providerId/mark-paid')
  async markProviderPayoutsAsPaid(
    @Req() req: Request,
    @Param('providerId') providerId: string,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.markProviderPayoutsAsPaid({
      tenantId,
      providerId,
    });
  }
  @Roles(Role.owner, Role.admin)
  @Get('plan-payments')
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2025-11-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2025-12-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    example: 'cmi8loc0000...',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: CustomerPlanPaymentStatus,
  })
  getPlanPayments(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
    @Query('status') status?: CustomerPlanPaymentStatus,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getPlanPayments({
      tenantId,
      from,
      to,
      locationId,
      status,
    });
  }
  @Roles(Role.owner, Role.admin)
  @Get('daily-revenue')
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2025-11-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2025-12-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    example: 'cmi8loc0000...',
  })
  @ApiQuery({
    name: 'providerId',
    required: false,
    type: String,
    example: 'cmi8prov0000...',
  })
  getDailyRevenue(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
    @Query('providerId') providerId?: string,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getDailyRevenue({
      tenantId,
      from,
      to,
      locationId,
      providerId,
    });
  }

  @Roles(Role.owner, Role.admin)
  @Get('cancellations')
  @ApiQuery({
    name: 'dateBasis',
    required: false,
    enum: ['appointment_date', 'event_date'],
    description:
      'Base da data do filtro: startAt (appointment_date) ou cancelledAt/noShowAt (event_date)',
  })
  @ApiQuery({
    name: 'day',
    required: false,
    type: String,
    example: '2026-02-18',
    description:
      'Filtra por um dia específico (YYYY-MM-DD). Sobrescreve from/to.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2025-11-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2025-12-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    example: 'cmi8loc0000...',
  })
  @ApiQuery({
    name: 'providerId',
    required: false,
    type: String,
    example: 'cmi8prov0000...',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['cancelled', 'no_show'],
  })
  async getCancellationsAndNoShows(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
    @Query('providerId') providerId?: string,
    @Query('type') type?: 'cancelled' | 'no_show',
    @Query('dateBasis') dateBasis?: 'appointment_date' | 'event_date',
    @Query('day') day?: string,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getCancellationsAndNoShows({
      tenantId,
      from,
      to,
      locationId,
      providerId,
      type,
      dateBasis,
      day,
    });
  }
  @Roles(Role.owner, Role.admin)
  @Get('appointments-overview')
  getAppointmentsOverview(
    @Req() req: Request,
    @Query() query: AppointmentsOverviewQueryDto,
  ) {
    const tenantId = req.user?.tenantId as string;

    return this.reportsService.getAppointmentsOverview({
      tenantId,
      from: query.from,
      to: query.to,
      locationId: query.locationId,
      providerId: query.providerId,
    });
  }
  @Roles(Role.owner, Role.admin)
  @Get('services')
  async getServicesReport(
    @Query() query: ServicesReportQueryDto,
    @Req() req: Request,
  ) {
    return this.reportsService.getServicesReport(req.user, query);
  }
}
