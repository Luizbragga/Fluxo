import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const CUID_REGEX = /^c[a-z0-9]{24}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export class ListAppointmentsDayQueryDto {
  @ApiProperty({
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  @IsString()
  @Matches(DATE_REGEX, { message: 'date must be in YYYY-MM-DD' })
  date!: string;

  @ApiProperty({
    required: false,
    example: 'cmhvugfn0008uysqrtd6e01o',
    description: 'Filtrar por provider; opcional',
  })
  @IsOptional()
  @IsString()
  @Matches(CUID_REGEX, { message: 'providerId deve ser um cuid válido' })
  providerId?: string;

  @ApiProperty({
    required: false,
    example: 'cmj45juec0003uyfg5qlypwm3',
    description: 'Filtrar por unidade (location); opcional',
  })
  @IsOptional()
  @IsString()
  @Matches(CUID_REGEX, { message: 'locationId deve ser um cuid válido' })
  locationId?: string;
}
