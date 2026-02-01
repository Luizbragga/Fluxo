import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum AllowedAppointmentStatusEnum {
  scheduled = 'scheduled',
  in_service = 'in_service',
  done = 'done',
  no_show = 'no_show',
  cancelled = 'cancelled',
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AllowedAppointmentStatusEnum)
  status!: AllowedAppointmentStatusEnum;
}
