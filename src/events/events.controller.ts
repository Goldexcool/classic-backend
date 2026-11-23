import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateEventDto } from './events.dto';
import { EventsService } from './events.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('public/:tenantSlug/events')
  getTenantPublic(@Param('tenantSlug') tenantSlug: string) {
    return this.events.getTenantPublic(tenantSlug);
  }

  @Get('public/:tenantSlug/events/:eventSlug')
  getPublic(@Param('tenantSlug') tenantSlug: string, @Param('eventSlug') eventSlug: string) {
    return this.events.getPublic(tenantSlug, eventSlug);
  }

  @Get('tenants/:tenantSlug/events')
  @UseGuards(JwtAuthGuard)
  list(@Param('tenantSlug') tenantSlug: string, @Req() request: AuthenticatedRequest) {
    return this.events.list(tenantSlug, request.user.id);
  }

  @Get('tenants/:tenantSlug/events/:eventId/payments')
  @UseGuards(JwtAuthGuard)
  listPayments(
    @Param('tenantSlug') tenantSlug: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.events.listPayments(tenantSlug, eventId, user.id);
  }

  @Post('tenants/:tenantSlug/events')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('tenantSlug') tenantSlug: string,
    @CurrentUser() user: { id: string },
    @Body() input: CreateEventDto,
  ) {
    return this.events.create(tenantSlug, user.id, input);
  }

  @Post('tenants/:tenantSlug/events/:eventId/publish')
  @UseGuards(JwtAuthGuard)
  publish(
    @Param('tenantSlug') tenantSlug: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.events.publish(tenantSlug, eventId, user.id);
  }
}
