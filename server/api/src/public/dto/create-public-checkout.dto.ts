import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePublicCheckoutDto {
  @ApiProperty({ example: 'cuid_do_service' })
  @IsString()
  serviceId: string;

  @ApiProperty({ example: 'cuid_do_provider' })
  @IsString()
  providerId: string;

  @ApiProperty({ example: '2026-01-26' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string; // YYYY-MM-DD

  @ApiProperty({ example: '14:20' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  time: string; // HH:mm

  @ApiProperty({ example: 'Henrique' })
  @IsString()
  customerName: string;

  @ApiProperty({ example: '+351912345678' })
  @IsString()
  customerPhone: string;

  // só usado quando a policy for online_optional
  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  payOnline?: boolean;
}
