FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for tsc)
RUN npm ci

COPY src ./src

# Build TypeScript
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 8000

CMD ["npm", "start"]
