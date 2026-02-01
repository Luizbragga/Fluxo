import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundBookingPaymentDto {
  @ApiPropertyOptional({
    description: 'Motivo do reembolso (interno)',
    example: 'Cliente cancelou e devolvemos o sinal',
    maxLength: 280,
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
