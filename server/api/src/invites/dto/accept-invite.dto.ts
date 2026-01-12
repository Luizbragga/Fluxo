import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Token raw do convite (vem na URL)' })
  @IsString()
  token!: string;

  @ApiProperty({ description: 'Nome do usuário que vai aceitar o convite' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description:
      'Email (se o convite não tiver email pré-definido, aqui vira obrigatório no service)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Telefone (opcional)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Senha para criar a conta',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    description:
      'locationId opcional (só usado se o convite não vier com locationId e o role exigir).',
  })
  @IsOptional()
  @IsString()
  locationId?: string;
}
