import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  async overview(userId: string) {
    const userResult = await this.db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
    const email = userResult.rows[0]?.email.toLowerCase();
    const adminEmails = new Set((process.env.ADMIN_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    if (!email || !adminEmails.has(email)) throw new ForbiddenException('Admin access is not enabled for this account');

    const [counts, salesByCurrency, recentEvents, recentUsers, recentPayments] = await Promise.all([
      this.db.query(
        `SELECT (SELECT count(*) FROM users) AS users,
                (SELECT count(*) FROM tenants) AS projects,
                (SELECT count(*) FROM events) AS events,
                (SELECT count(*) FROM events WHERE status = 'PUBLISHED') AS published_events,
                (SELECT count(*) FROM payments WHERE status = 'PAID') AS paid_orders`,
      ),
      this.db.query(
        `SELECT currency, count(*)::int AS paid_orders, sum(amount_minor)::text AS gross_minor,
                sum(platform_fee_minor)::text AS platform_fees_minor
         FROM payments WHERE status = 'PAID' GROUP BY currency ORDER BY currency`,
      ),
      this.db.query(
        `SELECT e.id, e.title, e.status, e.starts_at, t.name AS project_name,
                count(p.id) FILTER (WHERE p.status = 'PAID')::int AS paid_orders,
                COALESCE(sum(p.amount_minor) FILTER (WHERE p.status = 'PAID'), 0)::text AS gross_minor
         FROM events e JOIN tenants t ON t.id = e.tenant_id
         LEFT JOIN payments p ON p.event_id = e.id
         GROUP BY e.id, t.name ORDER BY e.created_at DESC LIMIT 20`,
      ),
      this.db.query('SELECT id, full_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 20'),
      this.db.query(
        `SELECT p.id, e.title AS event_title, p.buyer_name, p.buyer_email, p.quantity,
                p.amount_minor, p.platform_fee_minor, p.currency, p.provider, p.status, p.paid_at
         FROM payments p JOIN events e ON e.id = p.event_id
         ORDER BY p.created_at DESC LIMIT 30`,
      ),
    ]);

    return {
      counts: counts.rows[0],
      platformFeeBps: 300,
      salesByCurrency: salesByCurrency.rows,
      recentEvents: recentEvents.rows,
      recentUsers: recentUsers.rows,
      recentPayments: recentPayments.rows,
    };
  }
}
