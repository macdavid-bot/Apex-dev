FROM node:20-alpine

WORKDIR /app

COPY . .

RUN corepack enable
RUN pnpm install
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
