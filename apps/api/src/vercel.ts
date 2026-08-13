import type { IncomingMessage, ServerResponse } from 'node:http';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './main';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * The Nest app as a serverless request listener.
 *
 * `app.init()` rather than `app.listen()`: the platform owns the socket, so
 * binding a port here would crash the function. Everything else comes from
 * `configureApp` so the pipes, filters and CORS rules stay identical to
 * `pnpm dev`.
 */
const createServer = async (): Promise<RequestListener> => {
  const app = configureApp(await NestFactory.create(AppModule));

  await app.init();

  // `HttpServer.getInstance()` is untyped on the interface; with the default
  // (express) adapter the instance is the express app, itself a request listener.
  return app.getHttpAdapter().getInstance() as RequestListener;
};

/**
 * Cached across invocations that reuse the same warm instance — booting Nest
 * costs ~1s, so doing it per request would push every call into a timeout.
 *
 * The *promise* is cached rather than the resolved app so two requests racing
 * on a cold start share one boot instead of building the container twice.
 */
let serverPromise: Promise<RequestListener> | undefined;

const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  serverPromise ??= createServer().catch((error: unknown) => {
    // A rejected promise left in the cache would poison this instance for its
    // whole lifetime — every later request would replay the same boot error.
    serverPromise = undefined;
    throw error;
  });

  (await serverPromise)(req, res);
};

export default handler;
