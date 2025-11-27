import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreatePlanTemplateDto } from './create-plan-template.dto';

export class UpdatePlanTemplateDto extends PartialType(CreatePlanTemplateDto) {
  @ApiProperty({
    required: false,
    description: 'ID do plano (apenas para documentação do Swagger)',
  })
  id?: string;
}
