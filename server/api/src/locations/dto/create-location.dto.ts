import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingPaymentPolicy } from '@prisma/client';

export class CreateLocationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ description: 'Endereço da unidade (opcional)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description:
      'Horário padrão de funcionamento (Json no formato businessHoursTemplate)',
  })
  @IsOptional()
  businessHoursTemplate?: any;

  @ApiPropertyOptional({ description: 'Ativa (padrão true)' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Profissional responsável (opcional)' })
  @IsOptional()
  @IsString()
  managerProviderId?: string;
  @ApiPropertyOptional({
    description:
      'Intervalo de agendamento em minutos (override por unidade). Se null, usa o tenant.',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  bookingIntervalMin?: number | null;
  @ApiPropertyOptional({
    description:
      'Política de pagamento no agendamento: presencial, online opcional, ou online obrigatório.',
    enum: BookingPaymentPolicy,
  })
  @IsOptional()
  @IsEnum(BookingPaymentPolicy)
  bookingPaymentPolicy?: BookingPaymentPolicy;

  @ApiPropertyOptional({
    description:
      'Percentual de sinal (0 a 100). 0 = sem sinal | 100 = pagamento total.',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  bookingDepositPercent?: number;
}
