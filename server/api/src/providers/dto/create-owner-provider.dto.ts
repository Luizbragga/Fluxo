import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Specialty } from '@prisma/client';

export class CreateOwnerProviderDto {
  @ApiProperty({ example: 'Rafa Barber' })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'rafa@demo.com',
    description: 'Email do profissional para acesso ao sistema',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '+351910000000',
    required: false,
    description: 'Telefone do profissional',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'cuid-da-location',
    description: 'ID da filial (Location) onde este profissional atende',
  })
  @IsString()
  locationId!: string;

  @ApiProperty({
    enum: Specialty,
    required: false,
    example: Specialty.barber,
    description: 'Especialidade do profissional',
  })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiProperty({
    required: false,
    description:
      'Template semanal (JSON). Ex.: {"mon":[["09:00","12:00"],["14:00","18:00"]],"tue":[...]}',
  })
  @IsOptional()
  // armazenamos como JSON no banco; aqui aceitamos qualquer objeto bem formado
  weekdayTemplate?: Record<string, [string, string][]>;

  @ApiProperty({
    required: false,
    example: true,
    description:
      'Se verdadeiro, o sistema deverá enviar depois um convite para o profissional aceder ao Fluxo',
  })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}
