import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsEnum } from 'class-validator';
import { Specialty } from '@prisma/client';

export class CreateProviderDto {
  @ApiProperty({ example: 'Rafa Barber' })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'cuid-do-user',
    description:
      'ID do usuário que representa o login deste prestador. Opcional – se não for enviado, será criado um usuário novo a partir do email.',
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({
    example: 'pro@example.com',
    description:
      'Email do utilizador (usado para login) quando ainda não existe userId.',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: '+351910000000',
    description: 'Telefone / WhatsApp do profissional.',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'cuid-da-location',
    description: 'ID da filial (Location) onde este prestador atende',
  })
  @IsString()
  locationId!: string;

  @ApiProperty({
    enum: Specialty,
    required: false,
    example: Specialty.barber,
    description: 'Especialidade do prestador',
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
  // armazenaremos como JSON no banco; aqui aceitamos qualquer objeto
  weekdayTemplate?: Record<string, [string, string][]>;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
