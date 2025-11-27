import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ProviderPayoutsQueryDto } from './dto/provider-payouts-query.dto';

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
  getProviderEarnings(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getProviderEarnings({
      tenantId,
      from,
      to,
      locationId,
    });
  }
  @Roles(Role.owner, Role.admin)
  @Get('provider-payouts')
  async getProviderPayouts(
    @Req() req: any,
    @Query() query: ProviderPayoutsQueryDto,
  ) {
    const { tenantId } = req.user as { tenantId: string };

    return this.reportsService.getProviderPayouts(tenantId, query);
  }
}
