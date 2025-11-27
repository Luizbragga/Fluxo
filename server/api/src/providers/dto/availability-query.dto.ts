import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({
    example: '2025-11-15',
    description: 'Data em YYYY-MM-DD (UTC).',
  })
  @IsDateString()
  date!: string;
}
