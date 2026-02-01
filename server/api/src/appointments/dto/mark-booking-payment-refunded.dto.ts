import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkBookingPaymentRefundedDto {
  @ApiPropertyOptional({
    description: 'Motivo do reembolso (opcional)',
    example: 'Cliente cancelou / reagendou',
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
