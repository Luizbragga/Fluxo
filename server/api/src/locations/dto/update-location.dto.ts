import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateLocationDto {
  @ApiPropertyOptional({ description: 'Nome da unidade' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ description: 'Endereço da unidade' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description:
      'Horário padrão de funcionamento (Json no formato businessHoursTemplate)',
  })
  @IsOptional()
  businessHoursTemplate?: any;

  @ApiPropertyOptional({ description: 'Ativa/Inativa' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Profissional responsável (opcional)' })
  @IsOptional()
  @IsString()
  managerProviderId?: string;
}
