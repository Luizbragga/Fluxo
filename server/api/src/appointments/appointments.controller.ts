import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
  ApiBody,
  getSchemaPath,
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
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(
      user.tenantId,
      user.id,
      user.role,
      dto,
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
  listDayQuery(@Req() req: any, @Query() query: ListAppointmentsDayQueryDto) {
    const tenantId = req.user?.tenantId as string;
    return this.appointmentsService.findByDay(
      tenantId,
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
  updateFlexible(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: any, // <- por enquanto simplifica aqui
  ) {
    const { tenantId } = user;
    const { startAt, endAt, status } = dto;

    // se veio startAt/endAt -> usa o reschedule, que já tem validação de plano
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
        return this.appointmentsService.remove(tenantId, id, user.role);
      }

      return this.appointmentsService.updateStatus(tenantId, id, status);
    }

    // se não veio nada útil, só retorna o appointment atual
    return this.appointmentsService.findOne(id);
  }

  // Cancelamento lógico (status = cancelled)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const tenantId = user.tenantId as string;
    return this.appointmentsService.remove(tenantId, id, user.role);
  }
}
