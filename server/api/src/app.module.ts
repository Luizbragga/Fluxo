import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ServicesModule } from './services/services.module';
import { ProvidersModule } from './providers/providers.module';
import { BlocksModule } from './blocks/blocks.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { LocationsModule } from './locations/locations.module';
import { ReportsModule } from './reports/reports.module';
import { PlansModule } from './plans/plans.module';
import { OverviewModule } from './overview/overview.module';
import { CustomersModule } from './customers/customers.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    ProvidersModule,
    BlocksModule,
    AppointmentsModule,
    LocationsModule,
    ReportsModule,
    PlansModule,
    OverviewModule,
    CustomersModule,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
