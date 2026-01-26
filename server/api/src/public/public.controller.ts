import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicService } from './public.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('booking/:locationId')
  async getPublicBookingData(@Param('locationId') locationId: string) {
    return this.publicService.getPublicBookingData(locationId);
  }

  @Post('booking/:locationId/appointments')
  async createPublicAppointment(
    @Param('locationId') locationId: string,
    @Body() dto: CreatePublicAppointmentDto,
  ) {
    return this.publicService.createPublicAppointment(locationId, dto);
  }
}
