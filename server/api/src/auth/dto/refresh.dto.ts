import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsOptional() // <<<<<<<<<<  ADICIONE ISTO
  @IsString()
  @IsJWT()
  refreshToken!: string;
}
