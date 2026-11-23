require('dotenv').config();

const { hash } = require('bcryptjs');
const { Pool } = require('pg');

const demoEmail = process.env.DEMO_EMAIL?.trim().toLowerCase();
const demoPassword = process.env.DEMO_PASSWORD;
if (
  !process.env.DATABASE_URL ||
  Boolean(demoEmail) !== Boolean(demoPassword) ||
  (demoPassword && demoPassword.length < 8)
) {
  throw new Error('Set DATABASE_URL. To create a demo login too, set both DEMO_EMAIL and DEMO_PASSWORD (8+ characters).');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const samples = [
  {
    slug: 'agbara-nla', title: 'Agbara Nla', offsetDays: 6, hour: 11, minute: 44,
    venue: 'Lagos Island', price: 500000,
    description: 'A gathering for people building culture, community, and what comes next. Meet the voices shaping Lagos and spend an afternoon in good company.',
    program: '11:44 AM · Doors open\n12:30 PM · Welcome and introductions\n1:00 PM · Main sessions\n3:30 PM · Community networking',
    details: 'Please arrive early for check-in. Your ticket will be sent to the email used at checkout.',
    cover: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1800&q=85',
  },
  {
    slug: 'lagos-creative-sessions', title: 'Lagos Creative Sessions', offsetDays: 20, hour: 17, minute: 0,
    venue: 'The Zone, Gbagada', price: 350000,
    description: 'An evening of ideas, live conversations, and practical stories from independent creators and creative teams across Lagos.',
    program: '5:00 PM · Doors and gallery\n6:00 PM · Creative talks\n7:30 PM · Live showcase\n8:30 PM · Meet the community',
    details: 'Doors open one hour before the programme. This is a sample Gatepass event listing.',
    cover: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1800&q=85',
  },
  {
    slug: 'future-of-tech-lagos', title: 'Future of Tech Lagos', offsetDays: 54, hour: 9, minute: 0,
    venue: 'Eko Convention Centre', price: 1500000,
    description: 'A one-day summit for founders, product teams, investors, and builders exploring the next wave of technology in Africa.',
    program: '9:00 AM · Registration and coffee\n10:00 AM · Opening keynote\n12:00 PM · Product and AI sessions\n2:00 PM · Founder showcase\n4:30 PM · Networking',
    details: 'Bring your order confirmation for entry. This is a sample Gatepass event listing.',
    cover: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1800&q=85',
  },
  {
    slug: 'mainland-makers-market', title: 'Mainland Makers Market', offsetDays: 95, hour: 10, minute: 0,
    venue: 'Yaba, Lagos', price: 250000,
    description: 'Shop independent Nigerian brands, meet local makers, and discover a fresh mix of fashion, art, food, and homegrown design.',
    program: '10:00 AM · Market opens\n12:00 PM · Food and music\n2:00 PM · Maker demonstrations\n6:00 PM · Market closes',
    details: 'Family-friendly event. This is a sample Gatepass event listing.',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=85',
  },
  {
    slug: 'afrobeats-rooftop-live', title: 'Afrobeats Rooftop Live', offsetDays: 145, hour: 18, minute: 0,
    venue: 'Victoria Island, Lagos', price: 750000,
    description: 'A sunset rooftop show celebrating Afrobeats, new sounds, and the people moving Lagos nightlife forward.',
    program: '6:00 PM · Check-in and sunset set\n7:30 PM · Live performances\n10:00 PM · DJ set',
    details: 'Entry is subject to venue capacity. This is a sample Gatepass event listing.',
    cover: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1800&q=85',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let userId;
    if (demoEmail && demoPassword) {
      const existingUser = await client.query('SELECT id FROM users WHERE lower(email) = $1', [demoEmail]);
      userId = existingUser.rows[0]?.id;
      if (!userId) {
        const passwordHash = await hash(demoPassword, 12);
        const created = await client.query(
          'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
          ['Gatepass Demo Organizer', demoEmail, passwordHash],
        );
        userId = created.rows[0].id;
      }
    }

    const projectResult = await client.query(
      `INSERT INTO tenants (name, slug) VALUES ('Agbaranla Events', 'agbaranla')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const projectId = projectResult.rows[0].id;
    if (userId) {
      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [projectId, userId],
      );
    }

    for (const sample of samples) {
      const startsAtDate = new Date(Date.now() + sample.offsetDays * 86400000);
      startsAtDate.setUTCHours(sample.hour - 1, sample.minute, 0, 0);
      const startsAt = startsAtDate.toISOString();
      const eventResult = await client.query(
        `INSERT INTO events (tenant_id, title, slug, description, venue, starts_at, cover_image_url, gallery_urls, event_program, additional_info, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'PUBLISHED')
         ON CONFLICT (tenant_id, slug) DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description, venue = EXCLUDED.venue,
           starts_at = EXCLUDED.starts_at, cover_image_url = EXCLUDED.cover_image_url,
           gallery_urls = EXCLUDED.gallery_urls, event_program = EXCLUDED.event_program,
           additional_info = EXCLUDED.additional_info, status = 'PUBLISHED'
         RETURNING id`,
        [projectId, sample.title, sample.slug, sample.description, sample.venue, startsAt, sample.cover,
          JSON.stringify([sample.cover]), sample.program, sample.details],
      );
      const eventId = eventResult.rows[0].id;
      const ticket = await client.query('SELECT id FROM ticket_types WHERE event_id = $1 AND name = $2 LIMIT 1', [eventId, 'General admission']);
      if (ticket.rowCount) {
        await client.query(
          'UPDATE ticket_types SET price_minor = $2, currency = \'NGN\', quantity = GREATEST(sold_count, 120) WHERE id = $1',
          [ticket.rows[0].id, sample.price],
        );
      } else {
        await client.query(
          `INSERT INTO ticket_types (event_id, name, price_minor, currency, quantity)
           VALUES ($1, 'General admission', $2, 'NGN', 120)`,
          [eventId, sample.price],
        );
      }
    }
    await client.query('COMMIT');
    console.log(`Seeded ${samples.length} Agbaranla sample events under /agbaranla/events${userId ? ' with demo organizer access' : ''}.`);
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
