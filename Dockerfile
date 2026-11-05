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
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
# /setupが読むサンプルマップ
COPY --from=build --chown=node:node /app/maps ./maps
# rootで動かさない。書き込む場所は無い(prisma CLIは/tmpなど既定の場所だけを使う)
USER node
EXPOSE 3000
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
