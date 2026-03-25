# JWT Authorization Implementation Guide

This guide covers the JWT-based authorization system implemented for the PACS.

## Quick Start

### 1. Setup Environment

Generate a secure JWT secret:
```bash
openssl rand -hex 32
```

Add to `Orthanc/.env`:
```bash
JWT_SECRET_KEY=<your-generated-secret>
```

### 2. Start Services

```bash
# From project root
docker compose up -d
```

### 3. Create Admin User

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@pacs.local",
    "password": "your_secure_password",
    "role": "admin"
  }'
```

### 4. Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_secure_password"
  }'
```

Save the `access_token` from the response.

### 5. Access Orthanc

```bash
export TOKEN="<your_access_token>"

# List patients (requires JWT)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8042/patients
```

## Token Management

### Access Token
- **Lifetime:** 15 minutes
- **Usage:** All API requests
- **Format:** `Authorization: Bearer <token>`

### Refresh Token
- **Lifetime:** 7 days
- **Usage:** Get new access token
- **Single-use:** New refresh token issued on refresh

### Refresh Flow

```bash
# When access token expires, use refresh token
curl -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<your_refresh_token>"}'
```

## User Roles

### Admin
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin_user",
    "email": "admin@hospital.com",
    "password": "secure_pass",
    "role": "admin"
  }'
```
- Full system access
- User management
- Configuration changes

### Radiologist
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "dr_smith",
    "email": "smith@hospital.com",
    "password": "secure_pass",
    "role": "radiologist"
  }'
```
- View and write studies
- Create reports
- Delete studies

### Viewer
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "viewer_user",
    "email": "viewer@hospital.com",
    "password": "secure_pass",
    "role": "viewer"
  }'
```
- Read-only access to studies

## Common Operations

### Get Current User
```bash
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Logout (Revoke Token)
```bash
curl -X POST http://localhost:8000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<your_refresh_token>"}'
```

### List All Users (Direct DB Access)
```bash
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT username, email, role, is_active FROM users;"
```

### Deactivate User
```bash
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "UPDATE users SET is_active = false WHERE username = 'user_to_deactivate';"
```

## Integration with Applications

### Example: JavaScript/TypeScript

```typescript
async function login(username: string, password: string) {
  const response = await fetch('http://localhost:8000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  return data.access_token;
}

async function getPatients(token: string) {
  const response = await fetch('http://localhost:8042/patients', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  return response.json();
}

// Usage
const token = await login('admin', 'password');
const patients = await getPatients(token);
```

### Example: Python

```python
import requests

def login(username, password):
    response = requests.post('http://localhost:8000/auth/login', json={
        'username': username,
        'password': password
    })
    return response.json()['access_token']

def get_patients(token):
    response = requests.get('http://localhost:8042/patients', headers={
        'Authorization': f'Bearer {token}'
    })
    return response.json()

# Usage
token = login('admin', 'password')
patients = get_patients(token)
```

## Troubleshooting

### "Invalid token" Error
1. Check token hasn't expired (15 min lifetime)
2. Verify JWT_SECRET_KEY matches across services
3. Ensure user has valid refresh tokens

### "User is inactive" Error
```bash
# Reactivate user (from project root)
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "UPDATE users SET is_active = true WHERE username = 'user';"
```

### Auth Service Not Responding
```bash
# From project root, check logs
docker compose logs auth-service

# Restart service
docker compose restart auth-service

# Check health
curl http://localhost:8000/
```

### Orthanc Authorization Not Working
```bash
# From project root, check Orthanc logs
docker compose logs orthanc | grep -i authorization

# Verify auth service is accessible from Orthanc container
docker compose exec orthanc-dev wget -O- http://auth-service:8000/
```

## Migration from Basic Auth

During transition period, both authentication methods work:

### Basic Auth (Still Works)
```bash
curl -u admin:admin http://localhost:8042/patients
```

### JWT Auth (New)
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8042/patients
```

To fully migrate to JWT:
1. Create all users in auth service
2. Update applications to use JWT
3. Disable basic auth in `orthanc.json`:
   ```json
   "AuthenticationEnabled": false
   ```

## Security Best Practices

### Password Requirements
- Minimum 8 characters
- No complexity requirements (NIST guidelines)
- Store only hashed passwords (bcrypt)

### Token Storage
- **Access tokens:** Memory or session storage (15 min lifetime)
- **Refresh tokens:** Secure httpOnly cookies or encrypted storage

### Rotation
- **JWT secret:** Rotate every 90 days
- **Refresh tokens:** Automatically rotated on refresh
- **Passwords:** Implement password reset flow (future enhancement)

### Monitoring
```bash
# Monitor active sessions (from project root)
docker compose exec postgres psql -U orthanc -d orthanc \
  -c "SELECT COUNT(*) FROM refresh_tokens WHERE revoked = false AND expires_at > CURRENT_TIMESTAMP;"

# Monitor failed logins (check Orthanc logs)
docker compose logs orthanc | grep -i "unauthorized"
```

## Compliance Notes (PMK 24/2022)

### Audit Trail
All user actions are logged in Orthanc with user context from JWT payload:
- Username
- User ID
- Role
- Timestamp

### Data Residency
- Auth service runs on Indonesia-based server
- All user data stored in PostgreSQL
- No data transmitted outside Indonesia

### Access Control
- Role-based permissions enforced
- Token-based authentication with expiration
- Immediate token revocation on logout

## Next Steps

### Future Enhancements
- [ ] Password reset endpoint
- [ ] Two-factor authentication
- [ ] External IdP integration (Keycloak, Auth0)
- [ ] Study-level permissions
- [ ] User invitation system
- [ ] Admin UI for user management

### Performance Optimization
- [ ] Token caching (reduce DB queries)
- [ ] Horizontal scaling of auth service
- [ ] Connection pooling optimization
- [ ] Database query optimization
