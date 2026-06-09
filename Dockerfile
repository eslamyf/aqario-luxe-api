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

# 💡 حل الأزمة: إنشاء ملفين وهميين وفاضيين عشان dotenvx تبطل تلف في حلقة مفرغة وتشتغل علطول
RUN touch .env.production .env

# Ensure non-root user owns the app directory
RUN chown -R node:node /app
USER node

# Start the application directly using node
CMD ["node", "src/server.js"]