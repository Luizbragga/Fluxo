import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsEnum,
} from 'class-validator';
import { CustomerPlanStatus } from '@prisma/client';

// aceita CUID (c + 24) OU UUID v4
const ID_REGEX =
  /^(c[a-z0-9]{24}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/i;

export class CreateCustomerPlanDto {
  @ApiProperty({
    example: 'cmieam7330002uy187rriwq',
    description: 'ID do template de plano (cuid/uuid)',
  })
  @IsString()
  @IsNotEmpty({ message: 'planTemplateId é obrigatório' })
  @Matches(ID_REGEX, { message: 'planTemplateId deve ser um cuid/uuid válido' })
  planTemplateId!: string;

  @ApiProperty({ example: 'Henrique Teste Plano' })
  @IsString()
  @IsNotEmpty({ message: 'customerName é obrigatório' })
  customerName!: string;

  @ApiProperty({ example: '+3519xxxxxxxx' })
  @IsString()
  @IsNotEmpty({ message: 'customerPhone é obrigatório' })
  customerPhone!: string;

  @ApiProperty({
    required: false,
    enum: CustomerPlanStatus,
    default: CustomerPlanStatus.active,
  })
  @IsOptional()
  @IsEnum(CustomerPlanStatus)
  status?: CustomerPlanStatus;
}
