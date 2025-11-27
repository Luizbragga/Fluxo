import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  IsISO8601,
  IsNotEmpty,
} from 'class-validator';

// Aceita CUID (c + 24) OU UUID v4 (regex genérico para uuid)
const CUID_OR_UUID_REGEX =
  /^(c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class CreateBlockDto {
  @ApiProperty({
    example: 'cmhwrvpqf0008quysartde610',
    description: 'ID do provider (cuid ou UUID)',
  })
  @IsString()
  @IsNotEmpty({ message: 'providerId é obrigatório' })
  @Matches(CUID_OR_UUID_REGEX, {
    message: 'providerId deve ser um cuid ou UUID válido',
  })
  providerId!: string;

  @ApiProperty({ example: '2025-11-15T14:00:00Z' })
  @IsISO8601(
    { strict: true },
    {
      message:
        'startAt deve ser uma data ISO válida (ex: 2025-11-15T14:00:00Z)',
    },
  )
  startAt!: string;

  @ApiProperty({ example: '2025-11-15T16:00:00Z' })
  @IsISO8601(
    { strict: true },
    {
      message: 'endAt deve ser uma data ISO válida (ex: 2025-11-15T16:00:00Z)',
    },
  )
  endAt!: string;

  @ApiProperty({ required: false, example: 'Manutenção da cadeira' })
  @IsOptional()
  @IsString()
  reason?: string;
}
