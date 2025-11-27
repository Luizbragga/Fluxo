// api/src/main.ts (ou src/main.ts, dependendo da tua pasta)

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔐 CORS – libera o front em http://localhost:3000
  app.enableCors({
    origin: ['http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With, Accept',
    credentials: false, // se um dia usar cookies/sessions, aí vira true
  });

  // prefixo global /v1 (mantido)
  app.setGlobalPrefix('v1');

  // pipes globais (mantido)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger (mantido)
  const config = new DocumentBuilder()
    .setTitle('FLUXO API')
    .setDescription('OpenAPI do sistema de agendamento multi-tenant')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
}
bootstrap();
