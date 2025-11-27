import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCustomerPlanDto } from './create-customer-plan.dto';

export class UpdateCustomerPlanDto extends PartialType(CreateCustomerPlanDto) {
  @ApiProperty({
    required: false,
    description: 'ID do plano (apenas para documentação do Swagger)',
  })
  id?: string;
}
