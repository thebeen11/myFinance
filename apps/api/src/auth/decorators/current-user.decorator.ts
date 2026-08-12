import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The authenticated user's id, put on the request by `JwtStrategy.validate`.
 *
 * Every owned query is scoped by this value — Postgres has no row-level security
 * here, so forgetting it silently returns another user's data.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId: string } }>();

    if (!request.user) {
      // Unreachable behind the guard; a loud failure beats an undefined filter.
      throw new Error('CurrentUser used on a route that is not authenticated');
    }

    return request.user.userId;
  },
);
