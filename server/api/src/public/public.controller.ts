import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // -------------------------
  // LEGADO (por ID) - mantém
  // -------------------------
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

  // ---------------------------------------------
  // NOVO (por slug) - padrão de mercado (Fresha)
  // /public/booking/{tenantSlug}/{locationSlug}
  // ---------------------------------------------
  @Get('booking/:tenantSlug/:locationSlug')
  async getPublicBookingDataBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('locationSlug') locationSlug: string,
  ) {
    return this.publicService.getPublicBookingDataBySlug(
      tenantSlug,
      locationSlug,
    );
  }

  @Post('booking/:tenantSlug/:locationSlug/appointments')
  async createPublicAppointmentBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('locationSlug') locationSlug: string,
    @Body() dto: CreatePublicAppointmentDto,
  ) {
    return this.publicService.createPublicAppointmentBySlug(
      tenantSlug,
      locationSlug,
      dto,
    );
  }

  // --------------------------------------------------------
  // DISPONIBILIDADE PÚBLICA DO DIA (appointments + blocks)
  // GET /public/appointments?locationId=&providerId=&date=
  // --------------------------------------------------------
  @Get('appointments')
  @ApiQuery({
    name: 'locationId',
    required: true,
    type: String,
    description: 'ID da Location',
  })
  @ApiQuery({
    name: 'providerId',
    required: true,
    type: String,
    description: 'ID do Provider',
  })
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2026-01-26',
    description: 'YYYY-MM-DD (usado para filtrar o dia)',
  })
  async getPublicDayAppointments(
    @Query('locationId') locationId: string,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    return this.publicService.getPublicDayAppointments({
      locationId,
      providerId,
      date,
    });
  }
}
