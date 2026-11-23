import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
}

void bootstrap();
