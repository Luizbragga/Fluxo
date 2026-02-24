import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  // usa o hook do Node, não o $on do Prisma (evita TS2345)
  enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
