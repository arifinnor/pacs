const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://orthanc:password@postgres:5432/orthanc',

  // JWT
  jwtSecret: process.env.JWT_SECRET_KEY || 'change-me-in-production',
  accessTokenExpiresIn: '15m',
  refreshTokenExpiresDays: 7,

  // Server
  port: parseInt(process.env.PORT || '8000'),
  host: process.env.HOST || '0.0.0.0',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,https://localhost').split(','),
};

export default config;
