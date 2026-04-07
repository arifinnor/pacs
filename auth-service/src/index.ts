import 'dotenv/config';
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import config from './config.js';
import { authRoutes } from './routes/auth.js';
import { auditRoutes } from './routes/audit.js';
import { decodeToken } from './auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: { sub: string; username: string; role: string; type: string };
  }
}

async function build() {
  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  await fastify.register(cookie, {
    secret: config.jwtSecret,
  });

  // Add authentication decorator
  fastify.decorate('authenticate', async function(request: any, reply: any) {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return reply.code(401).send({ error: 'No token provided' });
      }

      const payload = decodeToken(token);

      if (!payload || payload.type !== 'access') {
        return reply.code(401).send({ error: 'Invalid token' });
      }

      request.user = payload;
    } catch (err) {
      reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(auditRoutes, { prefix: '/internal' });

  // Health check
  fastify.get('/', async (request, reply) => {
    return { status: 'ok', service: 'pacs-auth-service' };
  });

  return fastify;
}

const start = async () => {
  const app = await build();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down gracefully`);
    await app.close();
    const pool = (await import('./db/index.js')).default;
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    const { migrate } = await import('./db/migrate.js');
    await migrate();

    await app.listen({ port: config.port, host: config.host });
    console.log(`Auth service listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
