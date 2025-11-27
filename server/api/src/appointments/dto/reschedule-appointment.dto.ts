import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class RescheduleAppointmentDto {
  @ApiPropertyOptional({ example: '2025-11-17T10:00:00Z' })
  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @ApiPropertyOptional({ example: '2025-11-17T10:30:00Z' })
  @IsOptional()
  @IsISO8601()
  endAt?: string;
}
