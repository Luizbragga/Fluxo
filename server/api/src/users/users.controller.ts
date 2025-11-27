import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // todas exigem JWT
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@Req() req: any) {
    const user = req.user as { sub: string };
    return this.users.me(user.sub);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.owner, Role.admin)
  async list(@Req() req: any) {
    const user = req.user as { tenantId: string };
    return this.users.listByTenant(user.tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.owner, Role.admin)
  async create(@Req() req: any, @Body() dto: CreateUserDto) {
    const user = req.user as { tenantId: string };
    return this.users.createInTenant({
      tenantId: user.tenantId,
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: dto.role,
    });
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.owner, Role.admin)
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = req.user as { tenantId: string };
    return this.users.updateInTenant(user.tenantId, id, dto);
  }
}
