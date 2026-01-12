import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ValidateInviteQueryDto {
  @ApiProperty({ description: 'Token raw do convite (vem na URL)' })
  @IsString()
  token!: string;
}
