import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

/**
 * Everything that turns a bare Nest app into *this* app.
 *
 * Kept separate from `bootstrap()` so a serverless entrypoint can reuse it
 * without starting an HTTP listener.
 */
export const configureApp = (app: NestExpressApplication): NestExpressApplication => {
  // Express defaults to 100 kB, which a base64 receipt photo clears immediately.
  // 3 MB rather than something roomier because the browser downscales before it
  // sends and `ScanReceiptDto` caps the string itself — this is the outer wall,
  // not the guard.
  app.useBodyParser('json', { limit: '3mb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Erumah API')
      .setDescription('Accounts, categories and transactions for Erumah.')
      .setVersion('1.0')
      // Not cosmetic: the generated frontend client only attaches a bearer token
      // to operations the spec marks as secured.
      .addBearerAuth()
      .build();

    // UI at /api, JSON at /api-json — the frontend generates its client from the latter.
    // Dropping the "Controller" suffix keeps generated SDK names readable
    // (accountsFindAll rather than accountsControllerFindAll).
    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    });

    SwaggerModule.setup('api', app, document);
  }

  return app;
};

const bootstrap = async (): Promise<void> => {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
  const port = Number(process.env.PORT ?? 8001);

  await app.listen(port);
  Logger.log(`Erumah API listening on http://localhost:${port}`, 'Bootstrap');
};

if (require.main === module) {
  void bootstrap();
}
