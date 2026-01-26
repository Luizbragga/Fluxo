import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePublicAppointmentDto {
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsString()
  @IsNotEmpty()
  providerId: string;

  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date deve ser YYYY-MM-DD' })
  date: string;

  // HH:mm
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'time deve ser HH:mm' })
  time: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  customerName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  customerPhone: string;
}
