import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ProductCurrency, WebhookEvent } from '@bachs/sdk';
import { DatabaseService } from '../database/database.service';
import { BachsService } from './bachs.service';
import { CreateTicketCheckoutDto } from './payments.dto';

const SUPPORTED_CURRENCIES = new Set(['USD', 'NGN', 'GHS', 'KES', 'MWK', 'RWF', 'TZS', 'UGX', 'XAF', 'XOF', 'ZMW']);

type PaymentRow = {
  id: string;
  event_id: string;
  ticket_type_id: string;
  buyer_name: string;
  buyer_email: string;
  quantity: number;
  amount_minor: string;
  platform_fee_minor: string;
  currency: string;
  provider_reference: string;
  provider_idempotency_key: string;
  provider_checkout_id: string | null;
  provider_checkout_url: string | null;
  provider_outcome_unknown: boolean;
  status: string;
  expires_at: string | null;
};

type TicketRow = {
  event_id: string;
  event_title: string;
  event_slug: string;
  platform_fee_bps: number;
  ticket_type_id: string;
  ticket_name: string;
  price_minor: string;
  currency: string;
  quantity: number;
  sold_count: number;
};

function amountToMinor(amount: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) throw new InternalServerErrorException('Bachs returned an invalid payment amount');
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function minorToAmount(minor: bigint): string {
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}

function hasUnknownOutcome(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'outcomeUnknown' in error && error.outcomeUnknown === true;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly db: DatabaseService, private readonly bachs: BachsService) {}

  async createCheckout(tenantSlug: string, eventSlug: string, input: CreateTicketCheckoutDto) {
    const buyerName = input.buyerName.trim();
    const buyerEmail = input.buyerEmail.trim().toLowerCase();
    let payment: PaymentRow;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const ticketResult = await client.query<TicketRow>(
        `SELECT e.id AS event_id, e.title AS event_title, e.slug AS event_slug,
                COALESCE(e.platform_fee_bps, 300)::int AS platform_fee_bps,
                tt.id AS ticket_type_id, tt.name AS ticket_name, tt.price_minor::text AS price_minor,
                tt.currency, tt.quantity, tt.sold_count
         FROM events e JOIN tenants t ON t.id = e.tenant_id
         JOIN ticket_types tt ON tt.event_id = e.id
         WHERE t.slug = $1 AND e.slug = $2 AND e.status = 'PUBLISHED' AND tt.id = $3
         FOR UPDATE OF tt`,
        [tenantSlug, eventSlug, input.ticketTypeId],
      );
      const ticket = ticketResult.rows[0];
      if (!ticket) throw new NotFoundException('Published event ticket not found');
      if (!SUPPORTED_CURRENCIES.has(ticket.currency)) throw new BadRequestException('This ticket currency is not supported by Bachs checkout');

      const existingResult = await client.query<PaymentRow>(
        `SELECT id, event_id, ticket_type_id, buyer_name, buyer_email, quantity,
                amount_minor::text, platform_fee_minor::text, currency, provider_reference,
                provider_idempotency_key, provider_checkout_id, provider_checkout_url,
                provider_outcome_unknown, status, expires_at
         FROM payments WHERE checkout_request_key = $1 FOR UPDATE`,
        [input.requestKey],
      );
      const existing = existingResult.rows[0];
      if (existing) {
        if (
          existing.event_id !== ticket.event_id || existing.ticket_type_id !== ticket.ticket_type_id ||
          existing.quantity !== input.quantity || existing.buyer_name !== buyerName || existing.buyer_email !== buyerEmail
        ) throw new ConflictException('This checkout request key was already used for another order');
        payment = existing;
      } else {
        const price = BigInt(ticket.price_minor);
        if (price <= 0n) throw new BadRequestException('Free tickets do not use paid checkout');
        const total = price * BigInt(input.quantity);
        const platformFee = (total * BigInt(ticket.platform_fee_bps)) / 10000n;
        const reservedResult = await client.query<{ reserved: number }>(
          `SELECT COALESCE(SUM(quantity), 0)::int AS reserved FROM payments
           WHERE ticket_type_id = $1 AND status = 'PENDING'
             AND (provider_outcome_unknown = true OR expires_at > now())`,
          [ticket.ticket_type_id],
        );
        const available = ticket.quantity - ticket.sold_count - (reservedResult.rows[0]?.reserved ?? 0);
        if (available < input.quantity) throw new ConflictException('Not enough tickets are available');

        const inserted = await client.query<PaymentRow>(
          `INSERT INTO payments (
             event_id, ticket_type_id, buyer_name, buyer_email, quantity, amount_minor,
             platform_fee_minor, currency, provider, provider_reference, checkout_request_key,
             provider_idempotency_key, expires_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, 'BACHS', 'gp_' || replace(gen_random_uuid()::text, '-', ''),
             $9, 'gatepass-checkout-' || replace(gen_random_uuid()::text, '-', ''), now() + interval '25 hours'
           )
           RETURNING id, event_id, ticket_type_id, buyer_name, buyer_email, quantity,
                     amount_minor::text, platform_fee_minor::text, currency, provider_reference,
                     provider_idempotency_key, provider_checkout_id, provider_checkout_url,
                     provider_outcome_unknown, status, expires_at`,
          [ticket.event_id, ticket.ticket_type_id, buyerName, buyerEmail, input.quantity, total.toString(), platformFee.toString(), ticket.currency, input.requestKey],
        );
        payment = inserted.rows[0];
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (payment.status === 'PAID') throw new ConflictException('This order has already been paid');
    if (payment.provider_checkout_url) return this.checkoutResponse(payment, payment.provider_checkout_url);
    if (payment.provider_outcome_unknown) {
      throw new ServiceUnavailableException('This checkout is being reconciled. Please contact the event organizer before trying again.');
    }

    let session;
    try {
      session = await this.bachs.createCheckout(
        {
          pricing: { currency: payment.currency as ProductCurrency, amount: minorToAmount(BigInt(payment.amount_minor)), price_type: 'fixed' },
          customer: { email: payment.buyer_email, name: payment.buyer_name },
          reference: payment.provider_reference,
          expires_in_minutes: 60,
          success_url: `${this.frontendUrl()}/checkout/complete?paymentId=${encodeURIComponent(payment.id)}`,
          cancel_url: `${this.frontendUrl()}/${encodeURIComponent(tenantSlug)}/events/${encodeURIComponent(eventSlug)}?checkout=cancelled`,
          metadata: { payment_id: payment.id, event_id: payment.event_id, ticket_type_id: payment.ticket_type_id },
        },
        payment.provider_idempotency_key,
      );
    } catch (error) {
      if (hasUnknownOutcome(error)) {
        await this.db.query('UPDATE payments SET provider_outcome_unknown = true WHERE id = $1', [payment.id]);
      } else {
        await this.db.query('UPDATE payments SET expires_at = now() WHERE id = $1 AND status = \'PENDING\'', [payment.id]);
      }
      throw new ServiceUnavailableException(
        hasUnknownOutcome(error)
          ? 'Bachs did not confirm whether checkout was created. This order is held for reconciliation; do not submit another payment.'
          : 'Ticket checkout is temporarily unavailable. Please try again.',
      );
    }

    const updated = await this.db.query<PaymentRow>(
      `UPDATE payments SET provider_checkout_id = $2, provider_checkout_url = $3,
                           expires_at = $4::timestamptz + interval '24 hours'
       WHERE id = $1
       RETURNING id, event_id, ticket_type_id, buyer_name, buyer_email, quantity,
                 amount_minor::text, platform_fee_minor::text, currency, provider_reference,
                 provider_idempotency_key, provider_checkout_id, provider_checkout_url,
                 provider_outcome_unknown, status, expires_at`,
      [payment.id, session.checkout_id, session.checkout_url, session.expires_at],
    );
    const saved = updated.rows[0];
    if (!saved) throw new InternalServerErrorException('Checkout was created but the order could not be saved');
    return this.checkoutResponse(saved, session.checkout_url);
  }

  async getPublicStatus(paymentId: string) {
    const result = await this.db.query(
      `SELECT p.id, p.status, p.amount_minor::text, p.platform_fee_minor::text,
              p.currency, p.quantity, p.provider_outcome_unknown, tt.name AS ticket_type,
              e.title AS event_title, e.slug AS event_slug, t.slug AS tenant_slug
       FROM payments p JOIN events e ON e.id = p.event_id JOIN tenants t ON t.id = e.tenant_id
       LEFT JOIN ticket_types tt ON tt.id = p.ticket_type_id
       WHERE p.id = $1 AND p.provider = 'BACHS'`,
      [paymentId],
    );
    if (!result.rowCount) throw new NotFoundException('Order not found');
    const row = result.rows[0];
    return {
      id: row.id,
      status: row.status,
      confirmationPending: row.status === 'PENDING' && !row.provider_outcome_unknown,
      amountMinor: row.amount_minor,
      platformFeeMinor: row.platform_fee_minor,
      currency: row.currency,
      quantity: row.quantity,
      ticketType: row.ticket_type,
      eventTitle: row.event_title,
      eventPath: `/${encodeURIComponent(row.tenant_slug)}/events/${encodeURIComponent(row.event_slug)}`,
    };
  }

  async handleWebhook(event: WebhookEvent) {
    if (event.type !== 'checkout.completed' && event.type !== 'collection.succeeded') {
      await this.recordWebhook(event);
      return;
    }

    const data = event.data;
    const checkoutId = typeof data.checkout_id === 'string' ? data.checkout_id : null;
    if (!checkoutId) {
      await this.recordWebhook(event);
      return;
    }
    if (event.type === 'checkout.completed' && data.payment_status !== 'paid') {
      await this.recordWebhook(event);
      return;
    }
    if (event.type === 'collection.succeeded' && data.status !== 'SUCCEEDED') {
      await this.recordWebhook(event);
      return;
    }

    const reference = typeof data.reference === 'string' ? data.reference : null;
    const local = await this.db.query<PaymentRow>(
      `SELECT id, event_id, ticket_type_id, buyer_name, buyer_email, quantity,
              amount_minor::text, platform_fee_minor::text, currency, provider_reference,
              provider_idempotency_key, provider_checkout_id, provider_checkout_url,
              provider_outcome_unknown, status, expires_at
       FROM payments WHERE provider = 'BACHS' AND (provider_checkout_id = $1 OR provider_reference = $2)
       LIMIT 1`,
      [checkoutId, reference],
    );
    const payment = local.rows[0];
    if (!payment) {
      await this.recordWebhook(event);
      return;
    }

    const checkout = await this.bachs.getCheckout(checkoutId);
    if (
      checkout.checkout_id !== checkoutId || checkout.status !== 'completed' || checkout.payment_status !== 'paid' ||
      checkout.reference !== payment.provider_reference || !checkout.amount || !checkout.currency ||
      amountToMinor(checkout.amount) !== BigInt(payment.amount_minor) || checkout.currency !== payment.currency
    ) throw new InternalServerErrorException('Bachs checkout does not match the local order');

    if (reference && reference !== payment.provider_reference) throw new InternalServerErrorException('Bachs event reference does not match the local order');
    if (typeof data.amount === 'string' && amountToMinor(data.amount) !== BigInt(payment.amount_minor)) {
      throw new InternalServerErrorException('Bachs event amount does not match the local order');
    }
    if (typeof data.currency === 'string' && data.currency !== payment.currency) {
      throw new InternalServerErrorException('Bachs event currency does not match the local order');
    }

    const charge = typeof data.charge === 'object' && data.charge !== null ? data.charge as Record<string, unknown> : null;
    const details = typeof data.payment_method_details === 'object' && data.payment_method_details !== null
      ? data.payment_method_details as Record<string, unknown>
      : null;
    const paymentId = typeof data.charge_id === 'string' ? data.charge_id : typeof charge?.id === 'string' ? charge.id : null;
    const method = typeof details?.type === 'string' ? details.type : checkout.payment_method ?? null;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const recorded = await client.query(
        `INSERT INTO bachs_webhook_events (event_id, event_type) VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [event.id, event.type],
      );
      if (!recorded.rowCount) {
        await client.query('COMMIT');
        return;
      }

      const locked = await client.query<PaymentRow>(
        `SELECT id, event_id, ticket_type_id, buyer_name, buyer_email, quantity,
                amount_minor::text, platform_fee_minor::text, currency, provider_reference,
                provider_idempotency_key, provider_checkout_id, provider_checkout_url,
                provider_outcome_unknown, status, expires_at
         FROM payments WHERE id = $1 FOR UPDATE`,
        [payment.id],
      );
      const current = locked.rows[0];
      if (current && current.provider_reference === payment.provider_reference && current.status !== 'PAID') {
        const updated = await client.query(
          `UPDATE payments SET status = 'PAID', paid_at = COALESCE(paid_at, now()),
                               provider_checkout_id = COALESCE(provider_checkout_id, $2),
                               provider_payment_id = COALESCE(provider_payment_id, $3),
                               payment_method = COALESCE(payment_method, $4)
           WHERE id = $1 AND status = 'PENDING' RETURNING ticket_type_id, quantity`,
          [payment.id, checkoutId, paymentId, method],
        );
        const purchased = updated.rows[0];
        if (purchased?.ticket_type_id) {
          await client.query('UPDATE ticket_types SET sold_count = sold_count + $2 WHERE id = $1', [purchased.ticket_type_id, purchased.quantity]);
        }
      }
      await client.query('UPDATE bachs_webhook_events SET processed_at = now() WHERE event_id = $1', [event.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordWebhook(event: WebhookEvent) {
    await this.db.query(
      `INSERT INTO bachs_webhook_events (event_id, event_type, processed_at) VALUES ($1, $2, now())
       ON CONFLICT (event_id) DO NOTHING`,
      [event.id, event.type],
    );
  }

  private frontendUrl() {
    return (process.env.GATEPASS_FRONTEND_URL ?? 'https://gatepass.usevoii.com').replace(/\/$/, '');
  }

  private checkoutResponse(payment: PaymentRow, checkoutUrl: string) {
    return {
      paymentId: payment.id,
      checkoutUrl,
      amountMinor: payment.amount_minor,
      platformFeeMinor: payment.platform_fee_minor,
      currency: payment.currency,
      platformFeePercent: 3,
    };
  }
}
