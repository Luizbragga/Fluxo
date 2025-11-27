import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ProviderAvailabilityQueryDto {
  @IsDateString({}, { message: 'date deve ser YYYY-MM-DD' })
  date!: string;

  // opcional (fases futuras de fatiar por duração do serviço)
  @IsOptional()
  @IsString()
  serviceId?: string;
}
