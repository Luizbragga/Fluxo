import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async ok() {
    // ping simples no banco
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, ts: new Date().toISOString() };
  }
}
