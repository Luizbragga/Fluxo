import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Specialty } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  IsInt,
} from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({
    enum: Role,
    description: 'Role do usuário que será convidado',
  })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({
    enum: Specialty,
    description: 'Especialidade (recomendado/obrigatório para provider)',
  })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional({
    description:
      'Unidade (Location). Opcional, mas útil para já amarrar o acesso',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Email pré-preenchido no cadastro' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Telefone pré-preenchido no cadastro' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Validade do convite em horas (padrão 72)',
    default: 72,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720) // 30 dias
  expiresInHours?: number;
}
