import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class ProviderPayoutsQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @IsOptional()
  @IsString()
  from?: string; // ISO 8601

  @IsOptional()
  @IsString()
  to?: string; // ISO 8601
}
