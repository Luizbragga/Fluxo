import { Module } from '@nestjs/common';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ReportsModule], // <– novo
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
