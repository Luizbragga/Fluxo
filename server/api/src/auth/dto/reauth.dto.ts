import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ReauthDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
