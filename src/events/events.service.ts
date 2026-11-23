import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateEventDto } from './events.dto';

@Injectable()
export class EventsService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantSlug: string, userId: string) {
    const result = await this.db.query(
      `SELECT e.id, e.title, e.slug, e.description, e.venue, e.starts_at,
              e.cover_image_url, e.gallery_urls, e.event_program, e.additional_info, e.contact_email,
              e.status, e.created_at,
              (SELECT count(*)::int FROM payments p WHERE p.event_id = e.id AND p.status = 'PAID') AS paid_orders,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'currency', paid.currency,
                  'gross_minor', paid.gross_minor,
                  'platform_fees_minor', paid.platform_fees_minor
                ) ORDER BY paid.currency)
                FROM (
                  SELECT currency, sum(amount_minor)::text AS gross_minor,
                         sum(platform_fee_minor)::text AS platform_fees_minor
                  FROM payments WHERE event_id = e.id AND status = 'PAID' GROUP BY currency
                ) paid
              ), '[]'::jsonb) AS sales_by_currency
       FROM events e JOIN tenants t ON t.id = e.tenant_id
       JOIN tenant_memberships m ON m.tenant_id = t.id
       WHERE t.slug = $1 AND m.user_id = $2
       ORDER BY e.starts_at ASC`,
      [tenantSlug, userId],
    );
    return result.rows;
  }

  async listPayments(tenantSlug: string, eventId: string, userId: string) {
    const access = await this.db.query(
      `SELECT e.id FROM events e JOIN tenants t ON t.id = e.tenant_id
       JOIN tenant_memberships m ON m.tenant_id = t.id
       WHERE t.slug = $1 AND e.id = $2 AND m.user_id = $3`,
      [tenantSlug, eventId, userId],
    );
    if (!access.rowCount) throw new NotFoundException('Event not found');

    const result = await this.db.query(
      `SELECT p.id, p.buyer_name, p.buyer_email, tt.name AS ticket_type, p.quantity,
              p.amount_minor, p.platform_fee_minor, p.currency, p.provider, p.status,
              p.created_at, p.paid_at
       FROM payments p LEFT JOIN ticket_types tt ON tt.id = p.ticket_type_id
       WHERE p.event_id = $1 ORDER BY p.created_at DESC LIMIT 100`,
      [eventId],
    );
    return result.rows;
  }

  async create(tenantSlug: string, userId: string, input: CreateEventDto) {
    const membership = await this.db.query(
      `SELECT t.id FROM tenants t JOIN tenant_memberships m ON m.tenant_id = t.id
       WHERE t.slug = $1 AND m.user_id = $2`,
      [tenantSlug, userId],
    );
    const tenant = membership.rows[0];
    if (!tenant) throw new ForbiddenException('You do not have access to this tenant');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const eventResult = await client.query(
        `INSERT INTO events (tenant_id, title, slug, description, venue, starts_at, cover_image_url, gallery_urls, event_program, additional_info, contact_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
         RETURNING id, tenant_id, title, slug, description, venue, starts_at, cover_image_url, gallery_urls, event_program, additional_info, contact_email, platform_fee_bps, status, created_at`,
        [
          tenant.id,
          input.title.trim(),
          input.slug,
          input.description?.trim() || null,
          input.venue?.trim() || null,
          input.startsAt,
          input.coverImageUrl?.trim() || null,
          JSON.stringify(input.galleryUrls ?? []),
          input.eventProgram?.trim() || null,
          input.additionalInfo?.trim() || null,
          input.contactEmail?.trim().toLowerCase() || null,
        ],
      );
      const event = eventResult.rows[0];
      const ticketTypes = [];
      for (const ticket of input.ticketTypes) {
        const result = await client.query(
          `INSERT INTO ticket_types (event_id, name, price_minor, currency, quantity)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, price_minor, currency, quantity, sold_count`,
          [event.id, ticket.name.trim(), ticket.priceMinor, ticket.currency, ticket.quantity],
        );
        ticketTypes.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return { ...event, ticketTypes };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('That event link is already used in this tenant');
      throw error;
    } finally {
      client.release();
    }
  }

  async publish(tenantSlug: string, eventId: string, userId: string) {
    const result = await this.db.query(
      `UPDATE events e SET status = 'PUBLISHED'
       FROM tenants t, tenant_memberships m
       WHERE e.tenant_id = t.id AND m.tenant_id = t.id
         AND t.slug = $1 AND e.id = $2 AND m.user_id = $3
       RETURNING e.id, e.title, e.slug, e.status`,
      [tenantSlug, eventId, userId],
    );
    if (!result.rowCount) throw new NotFoundException('Event not found');
    return { ...result.rows[0], publicPath: `/api/public/${tenantSlug}/events/${result.rows[0].slug}` };
  }

  async getTenantPublic(tenantSlug: string) {
    const tenantResult = await this.db.query(
      'SELECT id, name, slug FROM tenants WHERE slug = $1',
      [tenantSlug],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new NotFoundException('Tenant not found');

    const events = await this.db.query(
      `SELECT id, title, slug, description, venue, starts_at, cover_image_url
       FROM events WHERE tenant_id = $1 AND status = 'PUBLISHED' ORDER BY starts_at ASC`,
      [tenant.id],
    );
    return { ...tenant, events: events.rows };
  }

  async getPublic(tenantSlug: string, eventSlug: string) {
    const eventResult = await this.db.query(
      `SELECT e.id, t.name AS tenant_name, t.slug AS tenant_slug, e.title, e.slug,
              e.description, e.venue, e.starts_at, e.cover_image_url, e.gallery_urls,
              e.event_program, e.additional_info, e.contact_email, e.platform_fee_bps, e.status
       FROM events e JOIN tenants t ON t.id = e.tenant_id
       WHERE t.slug = $1 AND e.slug = $2 AND e.status = 'PUBLISHED'`,
      [tenantSlug, eventSlug],
    );
    const event = eventResult.rows[0];
    if (!event) throw new NotFoundException('Published event not found');

    const tickets = await this.db.query(
      `SELECT id, name, price_minor, currency, quantity, sold_count
       FROM ticket_types WHERE event_id = $1 ORDER BY price_minor ASC`,
      [event.id],
    );
    return { ...event, ticketTypes: tickets.rows };
  }
}
