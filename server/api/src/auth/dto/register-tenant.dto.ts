import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @IsOptional()
  @IsString()
  tenantNif?: string;

  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  ownerRole?: Role; // default: owner
}
