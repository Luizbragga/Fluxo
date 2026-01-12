import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReauthGuard } from '../auth/guards/reauth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Sensitive } from '../auth/decorators/sensitive.decorator';

import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { ValidateInviteQueryDto } from './dto/validate-invite.query.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@ApiTags('Invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // ======================
  // CREATE (protegido)
  // ======================
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, ReauthGuard)
  @Roles(Role.owner, Role.admin)
  @Sensitive()
  @Post()
  async create(@Req() req: any, @Body() dto: CreateInviteDto) {
    const tenantId = req.user?.tenantId as string;

    const createdById =
      (req.user?.sub as string) ||
      (req.user?.userId as string) ||
      (req.user?.id as string);

    return this.invites.createInvite({ tenantId, createdById, dto });
  }

  // ======================
  // VALIDATE (público)
  // ======================
  @Get('validate')
  async validate(@Query() q: ValidateInviteQueryDto) {
    return this.invites.validateInvite(q.token);
  }

  // ======================
  // ACCEPT (público)
  // ======================
  @Post('accept')
  async accept(@Body() dto: AcceptInviteDto) {
    return this.invites.acceptInvite(dto);
  }
}
