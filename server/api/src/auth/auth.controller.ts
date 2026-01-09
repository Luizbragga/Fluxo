import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshDto } from './dto/refresh.dto';
import { ReauthDto } from './dto/reauth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.auth.registerTenant(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiBody({ type: RefreshDto, required: false })
  async refresh(@Req() req: Request, @Body() body?: RefreshDto) {
    const authHeader = (req.headers['authorization'] as string) ?? '';
    const headerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';
    const bodyToken = body?.refreshToken ?? '';
    const token = headerToken || bodyToken;
    if (!token) return { message: 'Refresh token ausente' };
    return this.auth.refreshFromToken(token);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiBody({ type: RefreshDto, required: false })
  async logout(@Req() req: Request, @Body() body?: RefreshDto) {
    const authHeader = (req.headers['authorization'] as string) ?? '';
    const headerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';
    const bodyToken = body?.refreshToken ?? '';
    const token = headerToken || bodyToken;
    if (!token) return;
    await this.auth.revokeRefresh(token);
  }

  // ✅ REAUTH
  @Post('reauth')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async reauth(@Req() req: any, @Body() dto: ReauthDto) {
    const userId = req.user?.id as string;
    return this.auth.reauth(userId, dto.password);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('me')
  me(@Req() req: any) {
    return { user: req.user };
  }
}
