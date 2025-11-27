# FLUXO – API do MVP de agendamentos

API em NestJS + Prisma + PostgreSQL para o sistema de agendamentos multi-tenant (barbearias / salões).

## 1. Stack e requisitos

- Node.js 20+
- npm (ou yarn/pnpm, mas o projeto atual usa npm)
- PostgreSQL (banco `barber` ou outro que você configurar)
- Redis (para futuras filas/notificações – já deixamos a URL pronta)

Principais libs:

- NestJS
- Prisma ORM
- class-validator / class-transformer
- JWT (autenticação)
- bcrypt (hash de senha)

---

## 2. Configuração de ambiente

### 2.1. Variáveis de ambiente

O projeto já vem com um `.env.example`.  
Passo a passo:

```bash
cp .env.example .env
```
