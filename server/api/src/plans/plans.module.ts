import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanTemplatesController } from './plan-templates.controller';
import { PlanTemplatesService } from './plan-templates.service';
import { CustomerPlansController } from './customer-plans.controller';
import { CustomerPlansService } from './customer-plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanTemplatesController, CustomerPlansController],
  providers: [PlanTemplatesService, CustomerPlansService],
})
export class PlansModule {}
