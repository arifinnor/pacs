import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns/addDays';
import { query } from '../db/index.js';
import { hashPassword, verifyPassword, createAccessToken, createRefreshToken, decodeToken } from '../auth.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/register', async (request, reply) => {
    const { username, email, password, role = 'viewer' } = request.body as any;

    // Validate input
    if (!username || !email || !password) {
      return reply.code(400).send({ error: 'Username, email, and password are required' });
    }

    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    // Check existing user
    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return reply.code(400).send({ error: 'Username or email already exists' });
    }

    // Create user
    const userId = uuidv4();
    const hashedPassword = await hashPassword(password);

    await query(
      'INSERT INTO users (id, username, email, hashed_password, role) VALUES ($1, $2, $3, $4, $5)',
      [userId, username, email, hashedPassword, role]
    );

    const result = await query('SELECT id, username, email, role, is_active, created_at FROM users WHERE id = $1', [userId]);

    return reply.code(201).send(result.rows[0]);
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body as any;

    // Validate input
    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    // Find user
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return reply.code(403).send({ error: 'User account is inactive' });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.hashed_password);

    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Update last login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Create tokens
    const accessToken = createAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const refreshToken = createRefreshToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    // Store refresh token
    const tokenId = uuidv4();
    const expiresAt = addDays(new Date(), 7);

    await query(
      'INSERT INTO refresh_tokens (id, token, user_id, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenId, refreshToken, user.id, expiresAt]
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 15 * 60, // 15 minutes
    };
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    const { refresh_token } = request.body as any;

    if (!refresh_token) {
      return reply.code(400).send({ error: 'Refresh token is required' });
    }

    // Decode and verify
    const payload = decodeToken(refresh_token);

    if (!payload || payload.type !== 'refresh') {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    // Check token in database
    const tokenResult = await query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = false AND expires_at > CURRENT_TIMESTAMP',
      [refresh_token]
    );

    if (tokenResult.rows.length === 0) {
      return reply.code(401).send({ error: 'Refresh token expired or invalid' });
    }

    // Get user
    const userResult = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      return reply.code(401).send({ error: 'User not found or inactive' });
    }

    const user = userResult.rows[0];

    // Create new tokens
    const accessToken = createAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const newRefreshToken = createRefreshToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    // Revoke old token, add new one
    await query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [refresh_token]);

    const newTokenId = uuidv4();
    const expiresAt = addDays(new Date(), 7);

    await query(
      'INSERT INTO refresh_tokens (id, token, user_id, expires_at) VALUES ($1, $2, $3, $4)',
      [newTokenId, newRefreshToken, user.id, expiresAt]
    );

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: 'bearer',
      expires_in: 15 * 60,
    };
  });

  // Validate (called by Orthanc)
  fastify.post('/validate', async (request, reply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return { granted: false };
      }

      const payload = decodeToken(token);

      if (!payload || payload.type !== 'access') {
        return { granted: false };
      }

      // Check if user has valid refresh tokens (not revoked)
      const result = await query(
        'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = $1 AND revoked = false AND expires_at > CURRENT_TIMESTAMP',
        [payload.sub]
      );

      const validTokens = parseInt(result.rows[0].count);

      if (validTokens === 0) {
        return { granted: false };
      }

      return { granted: true, validity: 60 };
    } catch (error) {
      console.error('Validate error', error);
      return { granted: false };
    }
  });

  // Get current user
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const payload = request.user as any;

      const result = await query('SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE id = $1', [payload.sub]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return result.rows[0];
    } catch (error) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const { refresh_token } = request.body as any;

    if (!refresh_token) {
      return reply.code(400).send({ error: 'Refresh token is required' });
    }

    // Revoke refresh token
    await query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [refresh_token]);

    return { message: 'Successfully logged out' };
  });
}
