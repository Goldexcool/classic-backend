require('dotenv').config();

const { hash } = require('bcryptjs');
const { Pool } = require('pg');

const demoEmail = process.env.DEMO_EMAIL?.trim().toLowerCase();
const demoPassword = process.env.DEMO_PASSWORD;
if (!process.env.DATABASE_URL || !demoEmail || !demoPassword || demoPassword.length < 8) {
  throw new Error('Set DATABASE_URL, DEMO_EMAIL, and a DEMO_PASSWORD of at least 8 characters.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const samples = [
  { slug: 'community-design-evening', title: 'Community Design Evening', offsetDays: -90, venue: 'Lagos Island', price: 500000 },
  { slug: 'makers-market-lagos', title: 'Makers Market Lagos', offsetDays: -45, venue: 'Victoria Island', price: 250000 },
  { slug: 'product-people-lagos', title: 'Product People Lagos', offsetDays: -10, venue: 'Yaba', price: 350000 },
  { slug: 'creative-futures-summit', title: 'Creative Futures Summit', offsetDays: 30, venue: 'Eko Atlantic', price: 1500000 },
  { slug: 'founders-and-builders', title: 'Founders and Builders Meetup', offsetDays: 90, venue: 'Lekki Phase 1', price: 750000 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingUser = await client.query('SELECT id FROM users WHERE lower(email) = $1', [demoEmail]);
    let userId = existingUser.rows[0]?.id;
    if (!userId) {
      const passwordHash = await hash(demoPassword, 12);
      const created = await client.query(
        'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Gatepass Demo Organizer', demoEmail, passwordHash],
      );
      userId = created.rows[0].id;
    }

    const projectResult = await client.query(
      `INSERT INTO tenants (name, slug) VALUES ('Gatepass Demo', 'gatepass-demo')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const projectId = projectResult.rows[0].id;
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')
       ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [projectId, userId],
    );

    for (const sample of samples) {
      const startsAt = new Date(Date.now() + sample.offsetDays * 86400000).toISOString();
      const eventResult = await client.query(
        `INSERT INTO events (tenant_id, title, slug, description, venue, starts_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PUBLISHED')
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description, venue = EXCLUDED.venue,
           starts_at = EXCLUDED.starts_at, status = 'PUBLISHED'
         RETURNING id`,
        [projectId, sample.title, sample.slug, 'A sample event page for the Gatepass demo workspace.', sample.venue, startsAt],
      );
      await client.query(
        `INSERT INTO ticket_types (event_id, name, price_minor, currency, quantity)
         SELECT $1, 'General admission', $2, 'NGN', 120
         WHERE NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = $1 AND name = 'General admission')`,
        [eventResult.rows[0].id, sample.price],
      );
    }
    await client.query('COMMIT');
    console.log(`Seeded ${samples.length} Gatepass demo events under /gatepass-demo/events.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Demo seed failed:', error.message);
  process.exitCode = 1;
});
