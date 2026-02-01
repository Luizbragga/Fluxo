import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAppointmentPaymentDto {
  @ApiProperty({
    description: 'Valor pago em centavos (ex: 20€ = 2000)',
    example: 2000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({
    description: 'Método de pagamento',
    enum: PaymentMethod,
    example: PaymentMethod.mbway,
  })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Observação opcional (ex: "sinal", "restante", etc.)',
    example: 'sinal',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
