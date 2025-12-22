import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLocationDto {
  @ApiPropertyOptional({ description: 'Nome da unidade' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ description: 'Endereço da unidade' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description:
      'Horário padrão de funcionamento (Json no formato businessHoursTemplate)',
  })
  @IsOptional()
  businessHoursTemplate?: any;

  @ApiPropertyOptional({ description: 'Ativa/Inativa' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Profissional responsável (opcional)' })
  @IsOptional()
  @IsString()
  managerProviderId?: string;

  @ApiPropertyOptional({
    description: 'Intervalo da agenda (min). Se null, usa o padrão do tenant.',
    example: 15,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  bookingIntervalMin?: number | null;
}
