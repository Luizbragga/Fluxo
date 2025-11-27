import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({
    example: 'Demo Barber - Centro',
    description: 'Nome da filial / unidade',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'demo-centro',
    description:
      'Slug opcional. Se não for enviado, será gerado automaticamente a partir do nome.',
  })
  @IsOptional()
  @IsString()
  slug?: string;
}
