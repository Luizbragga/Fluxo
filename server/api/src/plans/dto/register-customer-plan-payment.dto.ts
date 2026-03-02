import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max, IsOptional, IsDateString } from 'class-validator';

export class RegisterCustomerPlanPaymentDto {
  @ApiProperty({
    example: 3000,
    description: 'Valor pago em centavos (ex: 3000 = € 30,00).',
  })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({
    required: false,
    example: 1,
    description:
      'Quantidade de meses/ciclos a pagar adiantado. Default = 1. Máximo = 6.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  months?: number;

  @ApiProperty({
    required: false,
    description:
      'Data/hora do pagamento em ISO (ex: 2025-11-28T10:45:00Z). Se não enviar, usa "agora".',
  })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
