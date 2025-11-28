import { PartialType } from '@nestjs/swagger';
import { CreatePlanTemplateDto } from './create-plan-template.dto';

export class UpdatePlanTemplateDto extends PartialType(CreatePlanTemplateDto) {}
