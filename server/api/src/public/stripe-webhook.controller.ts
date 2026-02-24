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
import { AppointmentState, BookingPaymentStatus } from '@prisma/client';

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

    // Helper: estados finais no payment (não rebaixar)
    const isFinalPayment = (s: BookingPaymentStatus) =>
      s === BookingPaymentStatus.succeeded ||
      s === BookingPaymentStatus.refunded;

    // Helper: cancela appointment somente se estiver pendente (pra liberar slot)
    const cancelAppointmentIfPending = async (
      tx: any,
      appointmentId: string,
    ) => {
      const appt = await tx.appointment.findUnique({
        where: { id: appointmentId },
        select: { status: true },
      });

      if (appt?.status === AppointmentState.pending_payment) {
        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: AppointmentState.cancelled },
        });
      }
    };

    // Processa eventos importantes pro MVP
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

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
          if (isFinalPayment(current.status)) return;

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: BookingPaymentStatus.succeeded,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
            },
          });

          // ✅ pagamento ok: agenda (apenas se estava pendente)
          const appt = await tx.appointment.findUnique({
            where: { id: appointmentId },
            select: { status: true },
          });

          if (appt?.status === AppointmentState.pending_payment) {
            await tx.appointment.update({
              where: { id: appointmentId },
              data: { status: AppointmentState.scheduled },
            });
          }
        });

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;

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
          if (isFinalPayment(current.status)) return;

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: BookingPaymentStatus.canceled,
              stripeCheckoutSessionId: session.id,
            },
          });

          await cancelAppointmentIfPending(tx, appointmentId);
        });

        break;
      }

      // ✅ Checkout tentou pagar (async) e falhou
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;

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
          if (isFinalPayment(current.status)) return;

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: BookingPaymentStatus.failed,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
              failedAt: new Date(),
              failureMessage: 'checkout.session.async_payment_failed',
            },
          });

          await cancelAppointmentIfPending(tx, appointmentId);
        });

        break;
      }

      // ✅ Falha no PaymentIntent (nem sempre vem com metadata, mas tratamos quando der)
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;

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

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId },
            select: { status: true },
          });

          if (!current) return;

          if (isFinalPayment(current.status)) return;

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: BookingPaymentStatus.failed,
              stripePaymentIntentId: pi.id,
              failedAt: new Date(),
              failureMessage:
                pi.last_payment_error?.message ??
                pi.last_payment_error?.decline_code ??
                'payment_intent.payment_failed',
            },
          });

          await cancelAppointmentIfPending(tx, appointmentId);
        });

        break;
      }

      // ✅ PaymentIntent cancelado (usuário desistiu, timeout, Stripe cancelou)
      case 'payment_intent.canceled': {
        const pi = event.data.object;

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

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId },
            select: { status: true },
          });

          if (!current) return;

          // Guardrails: não rebaixa estados finais
          if (isFinalPayment(current.status)) return;

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: BookingPaymentStatus.canceled,
              stripePaymentIntentId: pi.id,
              // usando campos já existentes no teu padrão (evita quebrar schema)
              failedAt: new Date(),
              failureMessage: 'payment_intent.canceled',
            },
          });

          await cancelAppointmentIfPending(tx, appointmentId);
        });

        break;
      }

      // ✅ Reembolso feito no Stripe (painel / automação) -> refletir no banco
      case 'charge.refunded': {
        const charge = event.data.object;

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

        if (!bookingPaymentId || !appointmentId) break;

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.bookingPayment.findUnique({
            where: { id: bookingPaymentId },
            select: { status: true },
          });

          if (!current) return;

          // Guardrail: se já está refunded, não faz nada
          if (current.status === BookingPaymentStatus.refunded) {
            return;
          }

          // Regra MVP: só marca refunded se já tinha succeeded
          if (current.status !== BookingPaymentStatus.succeeded) {
            return;
          }

          await tx.bookingPayment.update({
            where: { id: bookingPaymentId },
            data: {
              status: BookingPaymentStatus.refunded,
              // usando campos existentes (evita quebrar schema)
              failedAt: new Date(),
              failureMessage: 'charge.refunded',
            },
          });

          // regra MVP: após refund, cancela o appointment (somente se pendente)
          await cancelAppointmentIfPending(tx, appointmentId);
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
