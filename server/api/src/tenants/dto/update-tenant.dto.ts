import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Nome da marca (brand)' })
  @IsOptional()
  @IsString()
  brandName?: string | null;

  @ApiPropertyOptional({ description: 'Nome legal (razão social)' })
  @IsOptional()
  @IsString()
  legalName?: string | null;

  @ApiPropertyOptional({ description: 'NIF do tenant' })
  @IsOptional()
  @IsString()
  nif?: string | null;
}
