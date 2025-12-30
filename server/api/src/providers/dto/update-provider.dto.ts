import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsEmail,
  MinLength,
} from 'class-validator';
import { Specialty } from '@prisma/client';

export class UpdateProviderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @IsOptional()
  @IsObject()
  weekdayTemplate?: Record<string, [string, string][]>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // ✅ novos: para editar login/contato (ficam no User)
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;
}
