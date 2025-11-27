import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateBlockDto {
  @ApiProperty({ required: false, example: '2025-11-15T14:15:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'startAt deve ser ISO válido' })
  startAt?: string;

  @ApiProperty({ required: false, example: '2025-11-15T16:00:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'endAt deve ser ISO válido' })
  endAt?: string;

  @ApiProperty({ required: false, example: 'Mudou a agenda' })
  @IsOptional()
  @IsString()
  reason?: string;
}
