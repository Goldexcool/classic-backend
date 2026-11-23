import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateTenantDto } from './tenants.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly db: DatabaseService) {}

  async listForUser(userId: string) {
    const result = await this.db.query(
      `SELECT t.id, t.name, t.slug, m.role, t.created_at
       FROM tenants t JOIN tenant_memberships m ON m.tenant_id = t.id
       WHERE m.user_id = $1 ORDER BY t.created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async create(userId: string, input: CreateTenantDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const tenantResult = await client.query(
        'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at',
        [input.name.trim(), input.slug],
      );
      const tenant = tenantResult.rows[0];
      await client.query(
        'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
        [tenant.id, userId, 'OWNER'],
      );
      await client.query('COMMIT');
      return { ...tenant, role: 'OWNER' };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('That tenant link is already taken');
      throw error;
    } finally {
      client.release();
    }
  }
}
