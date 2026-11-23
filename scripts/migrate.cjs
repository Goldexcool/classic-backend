require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationsDirectory = path.join(__dirname, '../src/database/migrations');
    const migrations = fs.readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql')).sort();
    for (const migration of migrations) {
      await pool.query(fs.readFileSync(path.join(migrationsDirectory, migration), 'utf8'));
    }
    console.log('Database schema is ready.');
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
