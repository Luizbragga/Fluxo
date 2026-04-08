import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';
import { CreatePublicCheckoutDto } from './dto/create-public-checkout.dto';
import { PaymentStatusQueryDto } from './dto/payment-status.query.dto';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // ---------------------------------------------
  // BOOKING DATA (slug)
  // GET /public/booking/{tenantSlug}/{locationSlug}
  // ---------------------------------------------
  @Throttle({ default: { ttl: 60, limit: 60 } }) // 60 req/min por IP
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
  @Throttle({ default: { ttl: 60, limit: 30 } }) // POST mais restrito
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
  @Throttle({ default: { ttl: 60, limit: 20 } }) // checkout é mais sensível
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
  @Throttle({ default: { ttl: 60, limit: 60 } })
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
  // --------------------------------------------------------
  // STATUS DO PAGAMENTO (Stripe) por session_id
  // GET /public/booking/payment-status?session_id=...
  // --------------------------------------------------------
  @Throttle({ default: { ttl: 60, limit: 60 } })
  @Get('booking/payment-status')
  async getPaymentStatus(@Query() query: PaymentStatusQueryDto) {
    return this.publicService.getPaymentStatusBySessionId(query.session_id);
  }
}
