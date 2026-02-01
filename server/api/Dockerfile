FROM node:20-alpine

WORKDIR /app

# Dependências primeiro (melhor cache)
COPY package.json package-lock.json ./
RUN npm ci

# Código da aplicação
COPY . .

# Prisma client (se houver schema)
RUN npx prisma generate || true

EXPOSE 4000

CMD ["npm", "run", "start:dev"]
