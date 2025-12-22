import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class UpdateTenantSettingsDto {
  // ---------------- Preferências gerais ----------------
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  use24hClock?: boolean;

  // ---------------- Notificações ----------------
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNewBooking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailCancellation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailReschedule?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyProvidersNewBooking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyProvidersChanges?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clientRemindersEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  reminderHoursBefore?: number;

  // ---------------- Segurança (MVP) ----------------
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  sessionIdleTimeoutMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireReauthForSensitiveActions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  twoFactorEnabled?: boolean;

  // ---------------- Agenda ----------------
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  defaultAppointmentDurationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferBetweenAppointmentsMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowOverbooking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  minCancelNoticeHours?: number;

  // ---------------- Extras ----------------
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoNoShowEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  noShowAfterMin?: number | null;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  defaultPaymentMethod?: PaymentMethod | null;

  // ---------------- Intervalo de agendamento (fixo) ----------------
  @ApiPropertyOptional({ enum: [5, 10, 15, 20, 30, 45, 60] })
  @IsOptional()
  @IsInt()
  @IsIn([5, 10, 15, 20, 30, 45, 60])
  bookingIntervalMin?: number;
}
