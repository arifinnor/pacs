function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://orthanc:password@postgres:5432/orthanc',

  // JWT
  jwtSecret: requireEnv('JWT_SECRET_KEY'),
  accessTokenExpiresIn: '15m',
  refreshTokenExpiresDays: 7,

  // Server
  port: parseInt(process.env.PORT || '8000'),
  host: process.env.HOST || '0.0.0.0',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,https://localhost').split(','),
};

export default config;
