import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AppointmentsOverviewQueryDto {
  @ApiPropertyOptional({
    description: 'Data inicial (ISO 8601). Ex: 2025-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Data final (ISO 8601). Ex: 2025-12-31T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtrar por unidade (locationId)' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por profissional (providerId)' })
  @IsOptional()
  @IsString()
  providerId?: string;
}
