import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

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
}
