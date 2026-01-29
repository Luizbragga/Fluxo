import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';
import { CreatePublicCheckoutDto } from './dto/create-public-checkout.dto';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // ---------------------------------------------
  // BOOKING DATA (slug)
  // GET /public/booking/{tenantSlug}/{locationSlug}
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

  // --------------------------------------------------------
  // CRIAR APPOINTMENT OFFLINE (slug)
  // POST /public/booking/{tenantSlug}/{locationSlug}/appointments
  // Observação: se policy = online_required -> bloqueia e manda usar /checkout
  // --------------------------------------------------------
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

  // -------------------------------------------------------------
  // CHECKOUT (Stripe) + policy da Location (slug)
  // POST /public/booking/{tenantSlug}/{locationSlug}/checkout
  // -------------------------------------------------------------
  @Post('booking/:tenantSlug/:locationSlug/checkout')
  async createCheckoutBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('locationSlug') locationSlug: string,
    @Body() dto: CreatePublicCheckoutDto,
  ) {
    return this.publicService.createCheckoutBySlug(
      tenantSlug,
      locationSlug,
      dto,
    );
  }

  // --------------------------------------------------------
  // DISPONIBILIDADE PÚBLICA DO DIA (slug) (appointments + blocks)
  // GET /public/booking/{tenantSlug}/{locationSlug}/appointments?providerId=&date=
  // --------------------------------------------------------
  @Get('booking/:tenantSlug/:locationSlug/appointments')
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
    description: 'YYYY-MM-DD (filtra o dia)',
  })
  async getPublicDayAppointmentsBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('locationSlug') locationSlug: string,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    return this.publicService.getPublicDayAppointmentsBySlug({
      tenantSlug,
      locationSlug,
      providerId,
      date,
    });
  }
}
