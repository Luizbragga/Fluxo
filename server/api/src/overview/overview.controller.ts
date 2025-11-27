import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OverviewService } from './overview.service';

@ApiTags('Overview')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get('owner')
  getOwnerOverview(@Req() req: any) {
    const { tenantId } = req.user as { tenantId: string };

    return this.overviewService.getOwnerOverview({ tenantId });
  }
}
