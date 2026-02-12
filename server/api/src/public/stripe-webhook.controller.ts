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

    // ⚠️ precisa do rawBody (ativado no main.ts)
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
    // -----------------------------
    // Idempotência: processa cada event.id 1x
    // -----------------------------
    const eventId = event.id;
    const eventType = event.type;

    const bookingPaymentIdFromMeta = (event.data?.object as any)?.metadata
      ?.bookingPaymentId as string | undefined;

    const appointmentIdFromMeta = (event.data?.object as any)?.metadata
      ?.appointmentId as string | undefined;

    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          id: eventId,
          type: eventType,
          bookingPaymentId: bookingPaymentIdFromMeta,
          appointmentId: appointmentIdFromMeta,
        },
      });
    } catch (e: any) {
      // Se já existe (replay do Stripe), não reprocessa.
      // Prisma P2002 = Unique constraint failed
      if (e?.code === 'P2002') {
        return { received: true, replay: true };
      }
      throw e;
    }

    // Processa eventos importantes pro MVP
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const bookingPaymentId = session.metadata?.bookingPaymentId;
        const appointmentId = session.metadata?.appointmentId;

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId },
            select: { status: true },
          });

          if (!current) return;

          // Guardrail: não sobrescreve estados finais
          if (
            current.status === ('refunded' as any) ||
            current.status === ('succeeded' as any)
          ) {
            return;
          }

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
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId },
            select: { status: true },
          });

          if (!current) return;

          // Guardrail: não sobrescreve estados finais
          if (
            current.status === ('refunded' as any) ||
            current.status === ('succeeded' as any)
          ) {
            return;
          }

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

      // ✅ Checkout tentou pagar (async) e falhou
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const bookingPaymentId = session.metadata?.bookingPaymentId;
        const appointmentId = session.metadata?.appointmentId;

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId },
            select: { status: true },
          });

          if (!current) return;

          // Guardrails: não rebaixa succeeded/refunded
          if (
            current.status === ('refunded' as any) ||
            current.status === ('succeeded' as any)
          ) {
            return;
          }

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: 'failed' as any,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
              failedAt: new Date(),
              failureMessage: 'checkout.session.async_payment_failed',
            },
          });

          // falhou: cancela para liberar o slot
          await tx.appointment.update({
            where: { id: appointmentId },
            data: { status: 'cancelled' as any },
          });
        });

        break;
      }

      // ✅ Falha no PaymentIntent (nem sempre vem com metadata, mas tratamos quando der)
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;

        let bookingPaymentId = pi.metadata?.bookingPaymentId;
        let appointmentId = pi.metadata?.appointmentId;

        // Best-effort: se não tiver metadata, tenta achar pelo stripePaymentIntentId
        if (!bookingPaymentId || !appointmentId) {
          const bp = await this.prisma.bookingPayment.findFirst({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true, appointmentId: true },
          });

          if (!bp?.id || !bp?.appointmentId) break;

          bookingPaymentId = bp.id;
          appointmentId = bp.appointmentId;
        }

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId! },
            select: { status: true },
          });

          if (!current) return;

          if (
            current.status === ('refunded' as any) ||
            current.status === ('succeeded' as any)
          ) {
            return;
          }

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId! },
            data: {
              status: 'failed' as any,
              stripePaymentIntentId: pi.id,
              failedAt: new Date(),
              failureMessage:
                pi.last_payment_error?.message ??
                pi.last_payment_error?.decline_code ??
                'payment_intent.payment_failed',
            },
          });

          await tx.appointment.update({
            where: { id: appointmentId! },
            data: { status: 'cancelled' as any },
          });
        });

        break;
      }

      // ✅ PaymentIntent cancelado (usuário desistiu, timeout, Stripe cancelou)
      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;

        let bookingPaymentId = pi.metadata?.bookingPaymentId;
        let appointmentId = pi.metadata?.appointmentId;

        // Best-effort: se não tiver metadata, tenta achar pelo stripePaymentIntentId
        if (!bookingPaymentId || !appointmentId) {
          const bp = await this.prisma.bookingPayment.findFirst({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true, appointmentId: true },
          });

          if (!bp?.id || !bp?.appointmentId) break;

          bookingPaymentId = bp.id;
          appointmentId = bp.appointmentId;
        }

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId! },
            select: { status: true },
          });

          if (!current) return;

          // Guardrails: não rebaixa estados finais
          if (
            current.status === ('refunded' as any) ||
            current.status === ('succeeded' as any)
          ) {
            return;
          }

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId! },
            data: {
              status: 'canceled' as any,
              stripePaymentIntentId: pi.id,
              // usando campos já existentes no teu padrão (evita quebrar schema)
              failedAt: new Date(),
              failureMessage: 'payment_intent.canceled',
            },
          });

          // cancela appointment pra liberar slot
          await tx.appointment.update({
            where: { id: appointmentId! },
            data: { status: 'cancelled' as any },
          });
        });

        break;
      }

      // ✅ Reembolso feito no Stripe (painel / automação) -> refletir no banco
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;

        // metadata é "ideal", mas nem sempre vem
        let bookingPaymentId = (charge.metadata as any)?.bookingPaymentId as
          | string
          | undefined;
        let appointmentId = (charge.metadata as any)?.appointmentId as
          | string
          | undefined;

        // Best-effort: tenta achar pelo payment_intent do charge
        if (!bookingPaymentId || !appointmentId) {
          const paymentIntentId =
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : null;

          if (!paymentIntentId) break;

          const bp = await this.prisma.bookingPayment.findFirst({
            where: { stripePaymentIntentId: paymentIntentId },
            select: { id: true, appointmentId: true },
          });

          if (!bp?.id || !bp?.appointmentId) break;

          bookingPaymentId = bp.id;
          appointmentId = bp.appointmentId;
        }

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId! },
            select: { status: true },
          });

          if (!current) return;

          // Guardrail: se já está refunded, não faz nada
          if (current.status === ('refunded' as any)) return;

          // Se quiser ser mais permissivo, remova este guardrail
          if (current.status !== ('succeeded' as any)) return;

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId! },
            data: {
              status: 'refunded' as any,
              // usando campos existentes (evita quebrar schema)
              failedAt: new Date(),
              failureMessage: 'charge.refunded',
            },
          });

          // regra MVP: após refund, cancela o appointment
          await tx.appointment.update({
            where: { id: appointmentId! },
            data: { status: 'cancelled' as any },
          });
        });

        break;
      }

      default:
        // ignora eventos não tratados no MVP
        break;
    }

    // Stripe espera 2xx
    return { received: true };
  }
}
