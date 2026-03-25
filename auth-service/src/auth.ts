import bcrypt from 'bcrypt';
import { sign, verify } from '@fastify/jwt';
import type { JwtPayload } from './db/index.js';
import config from './config.js';

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function createAccessToken(payload: Omit<JwtPayload, 'type'>): string {
  return sign({ ...payload, type: 'access' }, { expiresIn: config.accessTokenExpiresIn });
}

export function createRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
  return sign({ ...payload, type: 'refresh' }, { expiresIn: `${config.refreshTokenExpiresDays}d` });
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return verify(token) as JwtPayload;
  } catch {
    return null;
  }
}
