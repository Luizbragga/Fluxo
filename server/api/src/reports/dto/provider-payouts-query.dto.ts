import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export type ProviderPayoutStatusFilter = PayoutStatus | 'all';

export class ProviderPayoutsQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por unidade (locationId)' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por profissional (providerId)' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({
    description: 'Status do repasse: "pending" | "paid" | "all"',
    enum: [...Object.values(PayoutStatus), 'all'],
    example: 'pending',
  })
  @IsOptional()
  @IsIn([...Object.values(PayoutStatus), 'all'])
  status?: ProviderPayoutStatusFilter;

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
}
