import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte masculino' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 30,
    description: 'Duração do serviço em minutos',
  })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin: number;

  @ApiProperty({
    example: 1500,
    description: 'Preço em centavos (ex.: 1500 = 15,00€)',
  })
  @IsInt()
  @Min(0)
  priceCents: number;

  @ApiProperty({
    example: '15,00 €',
    description: 'Rótulo amigável para exibir no app (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  priceLabel?: string;

  @ApiProperty({
    example: true,
    description: 'Se o serviço está ativo para agendamento',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
