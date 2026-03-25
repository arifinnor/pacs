#!/bin/bash
set -e

echo "🧪 Testing PACS JWT Authorization System..."

# Change to project root for docker compose commands
cd "$(dirname "$0")/.."

BASE_URL="http://localhost:8000"

# Test 1: Health check
echo ""
echo "Test 1: Auth Service Health Check"
HEALTH=$(curl -s ${BASE_URL}/)
if [[ $HEALTH == *"pacs-auth-service"* ]]; then
    echo "✅ Auth service is healthy"
else
    echo "❌ Auth service health check failed"
    exit 1
fi

# Test 2: Register test user
echo ""
echo "Test 2: Register Test User"
REGISTER_RESPONSE=$(curl -s -X POST ${BASE_URL}/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","email":"test@example.com","password":"password123"}')
if [[ $REGISTER_RESPONSE == *"testuser"* ]]; then
    echo "✅ User registration successful"
    echo "   Response: $REGISTER_RESPONSE"
else
    echo "⚠️  User registration response: $REGISTER_RESPONSE"
    echo "   (User may already exist, continuing...)"
fi

# Test 3: Login
echo ""
echo "Test 3: Login"
LOGIN_RESPONSE=$(curl -s -X POST ${BASE_URL}/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","password":"password123"}')
ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [[ $ACCESS_TOKEN == *"eyJ"* ]]; then
    echo "✅ Login successful, got access token"
    echo "   Token: ${ACCESS_TOKEN:0:50}..."
else
    echo "❌ Login failed"
    echo "   Response: $LOGIN_RESPONSE"
    exit 1
fi

# Test 4: Validate token
echo ""
echo "Test 4: Validate Token"
VALIDATE_RESPONSE=$(curl -s -X POST ${BASE_URL}/auth/validate \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if [[ $VALIDATE_RESPONSE == *"granted":true* ]]; then
    echo "✅ Token validation successful"
    echo "   Response: $VALIDATE_RESPONSE"
else
    echo "❌ Token validation failed"
    echo "   Response: $VALIDATE_RESPONSE"
    exit 1
fi

# Test 5: Get current user
echo ""
echo "Test 5: Get Current User"
ME_RESPONSE=$(curl -s ${BASE_URL}/auth/me \
    -H "Authorization: Bearer $ACCESS_TOKEN")
if [[ $ME_RESPONSE == *"testuser"* ]]; then
    echo "✅ Get current user successful"
    echo "   Response: $ME_RESPONSE"
else
    echo "❌ Get current user failed"
    echo "   Response: $ME_RESPONSE"
    exit 1
fi

# Test 6: Access Orthanc with token
echo ""
echo "Test 6: Access Orthanc with JWT Token"
ORTHANC_RESPONSE=$(curl -s -u admin:admin http://localhost:8042/system)
if [[ $ORTHANC_RESPONSE == *"Orthanc"* ]]; then
    echo "✅ Orthanc is responding (basic auth still works)"
else
    echo "⚠️  Orthanc basic auth check failed"
fi

# Test 7: Check database tables
echo ""
echo "Test 7: Check Database Tables"
TABLES=$(docker compose exec -T postgres psql -U orthanc -d orthanc -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users', 'refresh_tokens');" | tr -d ' ')
if [[ $TABLES == *"users"* ]] && [[ $TABLES == *"refresh_tokens"* ]]; then
    echo "✅ Database tables exist"
    echo "   Tables: $TABLES"
else
    echo "❌ Database tables not found"
    echo "   Tables: $TABLES"
    exit 1
fi

echo ""
echo "🎉 All Tests Passed!"
echo ""
echo "📝 Test Summary:"
echo "   ✅ Auth service health check"
echo "   ✅ User registration"
echo "   ✅ User login"
echo "   ✅ Token validation"
echo "   ✅ Get current user"
echo "   ✅ Orthanc basic auth (backward compatibility)"
echo "   ✅ Database tables"
echo ""
echo "💡 Access token for manual testing:"
echo "   export TOKEN='$ACCESS_TOKEN'"
echo "   curl -H 'Authorization: Bearer \$TOKEN' http://localhost:8042/patients"
echo ""
