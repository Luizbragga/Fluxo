import { IsIn, IsOptional, IsString } from 'class-validator';

export class ServicesReportQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  // mesmo padrão que tu já usa nos outros relatórios
  @IsOptional()
  @IsIn(['day', 'month'])
  groupBy?: 'day' | 'month';
}
