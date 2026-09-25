# --- deps ---
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma
RUN npm install

# --- build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- run ---
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "server.js"]
