import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertProviderCommissionDto {
  @ApiProperty({
    required: false,
    nullable: true,
    example: 'cmhvvsuip0006uyqsdne4267g',
    description:
      'Service ID (cuid). Se omitido/null, a regra é padrão para TODOS os serviços do provider.',
  })
  @IsOptional()
  @IsString()
  serviceId?: string | null;

  @ApiProperty({
    example: 50,
    description:
      'Percentual de comissão do provider (0–100). Ex.: 50 = 50% do valor do serviço vai para o profissional.',
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  percentage!: number;

  @ApiProperty({
    required: false,
    example: true,
    description:
      'Se a regra está ativa. Padrão: true. (Permite desativar uma regra sem apagar.)',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
