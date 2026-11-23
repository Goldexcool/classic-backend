import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, RawBodyRequest, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { BachsService } from './bachs.service';
import { CreateTicketCheckoutDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller('public')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':tenantSlug/events/:eventSlug/checkout')
  @HttpCode(HttpStatus.CREATED)
  createCheckout(
    @Param('tenantSlug') tenantSlug: string,
    @Param('eventSlug') eventSlug: string,
    @Body() input: CreateTicketCheckoutDto,
  ) {
    return this.payments.createCheckout(tenantSlug, eventSlug, input);
  }

  @Get('payments/:paymentId')
  getStatus(@Param('paymentId') paymentId: string) {
    return this.payments.getPublicStatus(paymentId);
  }
}

@Controller('webhooks')
export class BachsWebhookController {
  constructor(private readonly bachs: BachsService, private readonly payments: PaymentsService) {}

  @Post('bachs')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() request: RawBodyRequest<Request>) {
    if (!request.rawBody) throw new BadRequestException('Webhook raw body is required');
    let event;
    try {
      event = this.bachs.verifyWebhook(request.rawBody, request.headers);
    } catch (error) {
      if (this.bachs.isInvalidWebhook(error)) throw new UnauthorizedException('Invalid Bachs webhook signature');
      throw error;
    }
    await this.payments.handleWebhook(event);
    return { received: true };
  }
}
