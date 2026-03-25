#!/bin/bash
set -e

echo "🔧 Setting up PACS JWT Authorization System..."

# Change to project root
cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "Please copy .env.example to .env and fill in the values"
    exit 1
fi

# Source .env file
source .env

# Check for JWT_SECRET_KEY
if [ -z "$JWT_SECRET_KEY" ]; then
    echo "❌ Error: JWT_SECRET_KEY not set in .env file"
    echo "Generate one with: openssl rand -hex 32"
    exit 1
fi

echo "✅ Environment variables loaded"

# Build and start services
echo "🐳 Starting Docker services..."
docker compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker compose exec -T postgres pg_isready -U orthanc -d orthanc > /dev/null 2>&1; do
    echo "   PostgreSQL not ready yet..."
    sleep 2
done

echo "✅ PostgreSQL is ready"

# Start auth service
echo "🚗 Starting auth service..."
docker compose up -d auth-service

# Wait for auth service to be healthy
echo "⏳ Waiting for auth service to be healthy..."
until docker compose exec -T auth-service wget --no-verbose --tries=1 --spider http://localhost:8000/ > /dev/null 2>&1; do
    echo "   Auth service not ready yet..."
    sleep 2
done

echo "✅ Auth service is healthy"

# Run migrations
echo "🗄️  Running database migrations..."
docker compose exec -T auth-service npm run db:migrate

echo "✅ Migrations completed successfully"

# Start Orthanc
echo "🏥 Starting Orthanc..."
docker compose up -d orthanc

# Wait for Orthanc to be ready
echo "⏳ Waiting for Orthanc to be ready..."
until curl -s -u admin:${ADMIN_PASSWORD} http://localhost:8042/system > /dev/null 2>&1; do
    echo "   Orthanc not ready yet..."
    sleep 2
done

echo "✅ Orthanc is ready"

# Start nginx
echo "🌐 Starting nginx..."
docker compose up -d nginx

echo ""
echo "🎉 JWT Authorization System Setup Complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Register an admin user:"
echo "      curl -X POST http://localhost:8000/auth/register \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"username\":\"admin\",\"email\":\"admin@pacs.local\",\"password\":\"secure_password\",\"role\":\"admin\"}'"
echo ""
echo "   2. Login to get tokens:"
echo "      curl -X POST http://localhost:8000/auth/login \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"username\":\"admin\",\"password\":\"secure_password\"}'"
echo ""
echo "   3. Test authorization:"
echo "      curl -H 'Authorization: Bearer <your_token>' http://localhost:8042/patients"
echo ""
