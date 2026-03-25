import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import config from './config.js';
import { authRoutes } from './routes/auth.js';

async function build() {
  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: config.jwtSecret,
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

      const payload = fastify.jwt.verify(token) as any;

      if (payload.type !== 'access') {
        return reply.code(401).send({ error: 'Invalid token type' });
      }

      request.user = payload;
    } catch (err) {
      reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });

  // Health check
  fastify.get('/', async (request, reply) => {
    return { status: 'ok', service: 'pacs-auth-service' };
  });

  return fastify;
}

const start = async () => {
  const app = await build();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`🚀 Auth service listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
