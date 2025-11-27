import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  IsNotEmpty,
} from 'class-validator';

// aceita CUID (c + 24) OU UUID v4
const ID_REGEX =
  /^(c[a-z0-9]{24}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/i;

export class CreateAppointmentDto {
  @ApiProperty({
    example: 'cmhvugfn0008uysqrtd6e010',
    description: 'ID do provider (cuid/uuid)',
  })
  @IsString()
  @IsNotEmpty({ message: 'providerId é obrigatório' })
  @Matches(ID_REGEX, { message: 'providerId deve ser um cuid/uuid válido' })
  providerId!: string;

  @ApiProperty({
    example: 'cmhvvcsd0000auqyskwa2dhes',
    description: 'ID do service (cuid/uuid)',
  })
  @IsString()
  @IsNotEmpty({ message: 'serviceId é obrigatório' })
  @Matches(ID_REGEX, { message: 'serviceId deve ser um cuid/uuid válido' })
  serviceId!: string;

  @ApiProperty({
    required: false,
    example: 'cmj123abc0008uysqrtd6e010',
    description:
      'ID do plano do cliente (customerPlan) caso o atendimento faça parte de um plano',
  })
  @IsOptional()
  @IsString()
  @Matches(ID_REGEX, { message: 'customerPlanId deve ser um cuid/uuid válido' })
  customerPlanId?: string;

  @ApiProperty({ example: '2025-11-17T09:45:00Z' })
  @IsISO8601(
    { strict: true },
    { message: 'startAt deve ser ISO (ex: 2025-11-17T09:45:00Z)' },
  )
  startAt!: string;

  @ApiProperty({ example: '2025-11-17T10:15:00Z' })
  @IsISO8601(
    { strict: true },
    { message: 'endAt deve ser ISO (ex: 2025-11-17T10:15:00Z)' },
  )
  endAt!: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @IsNotEmpty({ message: 'clientName é obrigatório' })
  clientName!: string;

  @ApiProperty({ example: '+351910000000' })
  @IsString()
  @IsNotEmpty({ message: 'clientPhone é obrigatório' })
  clientPhone!: string;

  @ApiProperty({ required: false, example: 'Observações do atendimento' })
  @IsOptional()
  @IsString()
  note?: string;
}
