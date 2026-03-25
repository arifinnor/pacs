# JWT Authorization Quick Reference

## Environment Setup
```bash
# Generate JWT secret
openssl rand -hex 32

# Add to Orthanc/.env
JWT_SECRET_KEY=<generated-secret>
```

## Start Services
```bash
# From project root
docker compose up -d

# Run migrations
docker compose exec auth-service npm run db:migrate

# Run tests
cd auth-service
./test.sh
```

## Common Commands

### Register User
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user","email":"user@host.com","password":"pass","role":"viewer"}'
```

### Login
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

### Validate Token
```bash
curl -X POST http://localhost:8000/auth/validate \
  -H "Authorization: Bearer <token>"
```

### Refresh Token
```bash
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<token>"}'
```

### Get Current User
```bash
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <token>"
```

### Logout
```bash
curl -X POST http://localhost:8000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<token>"}'
```

## Roles
- `admin` - Full access
- `radiologist` - View/write/delete studies
- `viewer` - Read-only

## Troubleshooting
```bash
# From project root
# Check logs
docker compose logs auth-service

# Restart service
docker compose restart auth-service

# Check database tables
docker compose exec postgres psql -U orthanc -d orthanc -c "\dt"

# List users
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT username, role, is_active FROM users;"
```

## Token Expiration
- Access token: 15 minutes
- Refresh token: 7 days

## Backward Compatibility
Basic auth still works during transition:
```bash
curl -u admin:admin http://localhost:8042/patients
```
