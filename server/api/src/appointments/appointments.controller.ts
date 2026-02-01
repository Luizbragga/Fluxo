import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
  ApiBody,
  getSchemaPath,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDayQueryDto } from './dto/list-day.query.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-status.dto';
import { CreateAppointmentPaymentDto } from './dto/create-appointment-payment.dto';
import { RefundBookingPaymentDto } from './dto/refund-booking-payment.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // Criar appointment (qualquer perfil interno do tenant no MVP)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Post()
  @ApiOperation({ summary: 'Criar agendamento' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(
      user.tenantId,
      user.id,
      user.role,
      dto,
    );
  }

  // Registrar pagamento manual (presencial / parcial)
  // ✅ Provider liberado aqui — mas o SERVICE deve validar ownership (appointment do próprio provider)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Post(':id/payments')
  @ApiOperation({ summary: 'Registrar pagamento manual no agendamento' })
  @ApiParam({
    name: 'id',
    type: String,
    example: 'cm1381j6w000fuyvw67olvu9h',
    description: 'ID do appointment',
  })
  @ApiBody({ type: CreateAppointmentPaymentDto })
  @ApiResponse({
    status: 201,
    description: 'Resumo de pagamentos do agendamento + lista de pagamentos',
  })
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateAppointmentPaymentDto,
  ) {
    return this.appointmentsService.addPayment(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  // Obter resumo + lista de pagamentos do agendamento
  // ✅ Provider liberado aqui — mas o SERVICE deve validar ownership (appointment do próprio provider)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get(':id/payments')
  @ApiOperation({
    summary: 'Obter resumo e lista de pagamentos do agendamento',
  })
  @ApiParam({
    name: 'id',
    type: String,
    example: 'cm1381j6w000fuyvw67olvu9h',
    description: 'ID do appointment',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumo de pagamentos do agendamento + lista de pagamentos',
  })
  getPaymentsSummary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.getPaymentsSummary(
      user.tenantId,
      id,
      user.id,
      user.role,
    );
  }
  // Reembolso (MVP): marca no banco como refunded (não chama Stripe)
  @Roles(Role.owner, Role.admin)
  @Post(':id/booking-payment/refund')
  @ApiOperation({ summary: 'Marcar pagamento online como reembolsado (MVP)' })
  @ApiParam({
    name: 'id',
    type: String,
    example: 'cm1381j6w000fuyvw67olvu9h',
    description: 'ID do appointment',
  })
  @ApiBody({ type: RefundBookingPaymentDto })
  refundBookingPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RefundBookingPaymentDto,
  ) {
    return this.appointmentsService.refundBookingPayment(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto.reason,
    );
  }

  // Listar appointments de um dia (com providerId opcional)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get()
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  @ApiQuery({
    name: 'providerId',
    required: false,
    type: String,
    example: 'cxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Opcional: filtra por provider',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    example: 'cxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Opcional: filtra por unidade (location)',
  })
  @ApiOperation({ summary: 'Listar agendamentos por dia' })
  listDayQuery(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAppointmentsDayQueryDto,
  ) {
    return this.appointmentsService.findByDay(
      user.tenantId,
      query.date,
      query.providerId,
      query.locationId,
    );
  }

  // Atualização flexível: OU mudar status OU reagendar
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Patch(':id')
  @ApiBody({
    description:
      'Envie { status } para mudar status OU { startAt, endAt } para reagendar.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(UpdateAppointmentStatusDto) },
        { $ref: getSchemaPath(RescheduleAppointmentDto) },
      ],
    },
  })
  @ApiOperation({ summary: 'Atualizar status ou reagendar' })
  updateFlexible(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    const { tenantId } = user;
    const { startAt, endAt, status } = dto;

    if (startAt || endAt) {
      return this.appointmentsService.reschedule(
        tenantId,
        id,
        { startAt, endAt },
        user.role,
      );
    }

    if (status) {
      if (status === 'cancelled') {
        return this.appointmentsService.remove(
          tenantId,
          id,
          user.id,
          user.role,
        );
      }
      return this.appointmentsService.updateStatus(tenantId, id, status);
    }

    return this.appointmentsService.findOne(id);
  }

  // Cancelamento lógico (status = cancelled)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar agendamento' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.remove(
      user.tenantId,
      id,
      user.id,
      user.role,
    );
  }
}
