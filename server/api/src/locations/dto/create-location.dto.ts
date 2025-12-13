import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Template padrão de horário de funcionamento desta unidade. ' +
      'Ex.: {"mon":[["08:00","13:00"],["14:00","20:00"]],"tue":[["09:00","18:00"]]}',
    example: {
      mon: [
        ['08:00', '13:00'],
        ['14:00', '20:00'],
      ],
      tue: [['09:00', '18:00']],
    },
  })
  @IsOptional()
  // armazenamos como JSON; aqui aceitamos um objeto genérico
  businessHoursTemplate?: Record<string, [string, string][]>;
  @ApiPropertyOptional({
    description: 'Se a unidade está ativa. Padrão: true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
  @ApiPropertyOptional({
    description:
      'ID do profissional responsável pela unidade (Provider.id). Opcional.',
    example: 'cmjfa3b0000abcd123456789',
  })
  @IsOptional()
  @IsString()
  managerProviderId?: string;
}
