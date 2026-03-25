# PACS Auth Service

JWT-based authentication and authorization service for the PACS system.

## Overview

This service provides:
- User registration and login
- JWT token generation (access + refresh tokens)
- Token validation for Orthanc authorization
- PostgreSQL-based user storage with role management
- Password hashing with bcrypt

## Architecture

```
[User] → Login Request
    ↓
[Auth Service :8000]
    ↓ (verifies credentials)
[PostgreSQL users table]
    ↓ (generates JWT + refresh token)
[Auth Service] → Access Token (15min) + Refresh Token (7days)
    ↓
[User] → Request with Bearer token
    ↓
[Orthanc Authorization Plugin] → Validates token via Auth Service
    ↓ (POST /auth/validate)
[Auth Service] → Verifies JWT signature + checks allowlist
    ↓ {"granted": true}
[Orthanc] → Processes request (with user context)
```

## User Roles

| Role | Permissions |
|------|-------------|
| **admin** | Full access, user management, system config |
| **radiologist** | View/write studies, create reports, delete |
| **viewer** | Read-only access to studies |

## API Endpoints

### POST /auth/register
Register a new user.

**Request:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "secure_password",
  "role": "viewer"  // optional, defaults to "viewer"
}
```

**Response:** User object (201 Created)

### POST /auth/login
Login and get JWT tokens.

**Request:**
```json
{
  "username": "johndoe",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 900
}
```

### POST /auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** New access_token and refresh_token

### POST /auth/validate
Validate JWT token (called by Orthanc Authorization Plugin).

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "granted": true,
  "validity": 60
}
```

### GET /auth/me
Get current user information.

**Headers:** `Authorization: Bearer <token>`

**Response:** User object

### POST /auth/logout
Logout and revoke refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run database migrations
npm run db:migrate
```

## API Documentation

For complete API documentation including:
- Authentication endpoints
- Orthanc REST API
- DICOMweb API
- Code examples (JavaScript, Python, Bash)

See: [docs/api-documentation.md](../docs/api-documentation.md)

## Postman Collection

Import `docs/postman-collection.json` into Postman to test all endpoints with pre-configured authentication.

## Docker

```bash
# Build image
docker build -t pacs-auth-service .

# Run container
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://orthanc:password@postgres:5432/orthanc \
  -e JWT_SECRET_KEY=your-secret-key \
  pacs-auth-service
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://orthanc:password@postgres:5432/orthanc` |
| `JWT_SECRET_KEY` | Secret for JWT signing | **Must be set in production** |
| `PORT` | Server port | `8000` |
| `HOST` | Server host | `0.0.0.0` |
| `CORS_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000,https://localhost` |

## Database Schema

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);
```

### refresh_tokens table
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(500) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN DEFAULT false
);
```

## Security

- Passwords hashed with bcrypt (cost factor 12)
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Refresh tokens are single-use (new one issued on refresh)
- JWT secret must be at least 32 characters

## Testing

```bash
# Run the test script
./test.sh
```

Or manually:

```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"password123"}'

# Validate
curl -X POST http://localhost:8000/auth/validate \
  -H "Authorization: Bearer <your_token>"
```

## Troubleshooting

### Connection refused
- Ensure the service is running: `docker compose ps auth-service`
- Check logs: `docker compose logs auth-service`

### Token validation fails
- Verify JWT_SECRET_KEY matches between auth service and Orthanc
- Check token hasn't expired (access tokens: 15 min)
- Ensure user has valid, non-revoked refresh tokens

### Database errors
- Verify PostgreSQL is running: `docker compose ps postgres`
- Check DATABASE_URL is correct
- Ensure migrations have been run

## License

MIT
