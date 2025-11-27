import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

// Usa o enum novo do schema
export enum AppointmentStateEnum {
  scheduled = 'scheduled',
  in_service = 'in_service',
  done = 'done',
  no_show = 'no_show',
  cancelled = 'cancelled',
}

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: AppointmentStateEnum,
    example: 'in_service',
  })
  @IsEnum(AppointmentStateEnum)
  status!: AppointmentStateEnum;
}
