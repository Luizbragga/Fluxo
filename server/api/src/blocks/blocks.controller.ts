import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  // owner/admin/attendant podem bloquear qualquer provider do tenant
  // provider só pode bloquear a própria agenda (checado no service)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Post()
  create(@Req() req: any, @Body() dto: CreateBlockDto) {
    const tenantId = req.user?.tenantId as string;
    const user = {
      id: req.user?.id as string,
      role: req.user?.role as Role,
    };
    return this.blocksService.create(tenantId, user, dto);
  }

  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBlockDto,
  ) {
    const tenantId = req.user?.tenantId as string;
    const user = {
      id: req.user?.id as string,
      role: req.user?.role as Role,
    };
    return this.blocksService.update(tenantId, user, id, dto);
  }

  // provider não pode deletar bloqueios de outros providers (checado no service)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    const user = {
      id: req.user?.id as string,
      role: req.user?.role as Role,
    };
    return this.blocksService.remove(tenantId, user, id);
  }

  // listagem: owner/admin/attendant podem ver qualquer provider;
  // provider só enxerga os próprios blocks (checado no service)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get()
  list(
    @Req() req: any,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    const tenantId = req.user?.tenantId as string;
    const user = {
      id: req.user?.id as string,
      role: req.user?.role as Role,
    };
    return this.blocksService.listByProviderAndDate(
      tenantId,
      user,
      providerId,
      date,
    );
  }
}
