import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  controllers: [PublicController, StripeWebhookController],
  providers: [PublicService, PrismaService],
})
export class PublicModule {}
