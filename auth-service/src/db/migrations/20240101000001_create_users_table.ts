import { PoolClient } from 'pg';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      hashed_password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'viewer',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP WITH TIME ZONE
    );
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS users CASCADE;');
}
