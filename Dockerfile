# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY --from=builder /app/src ./src

# 💡 حل السحر: إنشاء ملف .env.production فاضي عشان نوقف حلقة dotenvx المفرغة
RUN touch .env.production

# Ensure non-root user owns the app directory
RUN chown -R node:node /app
USER node

# Start the application
CMD ["npm", "start"]