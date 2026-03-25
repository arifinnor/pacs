import { Pool, PoolClient, QueryResult } from 'pg';
import config from '../config.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export interface User {
  id: string;
  username: string;
  email: string;
  hashed_password: string;
  role: 'admin' | 'radiologist' | 'viewer';
  is_active: boolean;
  created_at: Date;
  last_login: Date | null;
}

export interface RefreshToken {
  id: string;
  token: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
  revoked: boolean;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  type: 'access' | 'refresh';
}

export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error', { text, error });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

export default pool;
