import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsCronService } from './appointments-cron.service';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsCronService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
