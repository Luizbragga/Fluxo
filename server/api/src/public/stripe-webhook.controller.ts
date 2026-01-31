import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Public')
@Controller('public')
export class StripeWebhookController {
  private stripe: Stripe | null = null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      this.stripe = new Stripe(key, {
        apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
      });
    }
  }

  private requireStripe() {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe não configurado (STRIPE_SECRET_KEY ausente).',
      );
    }
    return this.stripe;
  }

  // Stripe chama isso. Não é pra aparecer no Swagger.
  @ApiExcludeEndpoint()
  @Post('webhooks/stripe')
  async handleStripeWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    const stripe = this.requireStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET ausente.');
    }
    if (!signature) {
      throw new BadRequestException('Stripe-Signature ausente.');
    }

    // ⚠️ precisa do rawBody (você já ativou no main.ts)
    const rawBody: Buffer | undefined = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException(
        'rawBody ausente. Verifique rawBody:true no NestFactory.',
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Assinatura inválida: ${err?.message}`);
    }

    // Processa eventos importantes pro MVP
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const bookingPaymentId = session.metadata?.bookingPaymentId;
        const appointmentId = session.metadata?.appointmentId;

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          // atualiza payment
          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: 'succeeded' as any,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
            },
          });

          // confirma appointment
          await tx.appointment.update({
            where: { id: appointmentId },
            data: { status: 'scheduled' as any },
          });
        });

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;

        const bookingPaymentId = session.metadata?.bookingPaymentId;
        const appointmentId = session.metadata?.appointmentId;

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: 'canceled' as any,
              stripeCheckoutSessionId: session.id,
            },
          });

          await tx.appointment.update({
            where: { id: appointmentId },
            data: { status: 'cancelled' as any },
          });
        });

        break;
      }
    }

    // Stripe espera 2xx
    return { received: true };
  }
}
