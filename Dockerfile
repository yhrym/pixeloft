FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
# migrate deployに使うprisma CLIだけ別に入れる（standaloneには入らない）
RUN npm install -g prisma@6.19.3
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# /setupが読むサンプルマップ
COPY --from=build /app/maps ./maps
EXPOSE 3000
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
