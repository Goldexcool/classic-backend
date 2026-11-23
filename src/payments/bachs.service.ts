import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bachs, BachsWebhookError, webhooks } from '@bachs/sdk';
import type { CheckoutSessionCreated, CheckoutSessionResponse, WebhookEvent } from '@bachs/sdk';

@Injectable()
export class BachsService {
  private clientInstance: Bachs | null = null;

  constructor(private readonly config: ConfigService) {}

  createCheckout(input: Parameters<Bachs['checkoutSessions']['create']>[0], idempotencyKey: string): Promise<CheckoutSessionCreated> {
    return this.client().checkoutSessions.create(input, { idempotencyKey });
  }

  getCheckout(checkoutId: string): Promise<CheckoutSessionResponse> {
    return this.client().checkoutSessions.get(checkoutId);
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent {
    const secret = this.config.get<string>('BACHS_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Bachs webhook verification is not configured');
    try {
      return webhooks.constructEvent(rawBody, headers, secret);
    } catch (error) {
      if (error instanceof BachsWebhookError) throw error;
      throw error;
    }
  }

  isInvalidWebhook(error: unknown): boolean {
    return error instanceof BachsWebhookError;
  }

  private client(): Bachs {
    if (this.clientInstance) return this.clientInstance;
    const apiKey = this.config.get<string>('BACHS_SECRET_KEY') || this.config.get<string>('BACHS_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Bachs checkout is not configured');
    this.clientInstance = new Bachs({ apiKey });
    return this.clientInstance;
  }
}
