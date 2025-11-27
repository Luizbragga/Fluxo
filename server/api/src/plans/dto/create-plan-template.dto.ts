import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

// aceita CUID (c + 24) OU UUID v4
const ID_REGEX =
  /^(c[a-z0-9]{24}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/i;

export class CreatePlanTemplateDto {
  @ApiProperty({
    example: 'cmiea0yy0000uycwl31shlmn',
    description: 'ID da localização (cuid/uuid)',
  })
  @IsString()
  @IsNotEmpty({ message: 'locationId é obrigatório' })
  @Matches(ID_REGEX, { message: 'locationId deve ser um cuid/uuid válido' })
  locationId!: string;

  @ApiProperty({
    example: 'Plano barba + cabelo 15/15',
  })
  @IsString()
  @IsNotEmpty({ message: 'name é obrigatório' })
  name!: string;

  @ApiProperty({
    required: false,
    example: 'Pacote com barba e cabelo a cada 15 dias',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 3000,
    description: 'Preço do plano em centavos (ex: 3000 = 30€)',
  })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiProperty({
    example: 15,
    description: 'Intervalo em dias entre as visitas (ex: 15, 30)',
  })
  @IsInt()
  @Min(1)
  intervalDays!: number;

  @ApiProperty({
    required: false,
    example: 2,
    description: 'Quantas visitas o cliente tem em cada intervalo',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  visitsPerInterval?: number;

  @ApiProperty({
    required: false,
    example: ['cmiebla0000svc1', 'cmiebla0000svc2'],
    description:
      'IDs dos serviços que o cliente faz no mesmo dia (barba + cabelo + sobrancelha)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sameDayServiceIds?: string[];

  @ApiProperty({
    required: false,
    example: [1, 3, 5],
    description: 'Dias da semana permitidos (0=Dom, 1=Seg, ... 6=Sáb)',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedWeekdays?: number[];
}
