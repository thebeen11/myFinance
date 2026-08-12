import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

import type { CreateClientConfig } from '@/api/client.gen';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/auth-storage';
import type { StoredTokens } from '@/lib/auth-storage';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001';

const instance = axios.create({ baseURL });

/**
 * At most one rotation is ever in flight.
 *
 * Without this, a page that fires four queries at once would spend four refresh
 * tokens against a server that revokes each one as it is used — the second
 * request would look exactly like a replayed token, and the API would (correctly)
 * revoke the whole family and log the user out.
 */
let rotation: Promise<string | null> | null = null;

const rotateTokens = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) return null;

  try {
    // Bare axios rather than `instance`: the refresh call must never re-enter the
    // interceptor below, or a failing refresh would retry itself forever.
    const { data } = await axios.post<StoredTokens>(`${baseURL}/auth/refresh`, { refreshToken });

    setTokens(data);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
};

type RetriableRequest = InternalAxiosRequestConfig & { isRetry?: boolean };

instance.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as RetriableRequest | undefined;

  // `isRetry` stops the loop: a 401 on the retried request means the fresh token
  // was rejected too, so there is nothing left to try.
  if (error.response?.status !== 401 || !request || request.isRetry) {
    throw error;
  }

  request.isRetry = true;
  rotation ??= rotateTokens().finally(() => {
    rotation = null;
  });

  const accessToken = await rotation;

  if (!accessToken) {
    clearTokens();

    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      // A hard navigation, not router.push: this runs outside React (no hooks
      // available), and discarding all in-memory state is the point when a
      // session dies.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    }

    throw error;
  }

  request.headers.set('Authorization', `Bearer ${accessToken}`);

  return instance(request);
});

/**
 * Runtime configuration for the generated SDK — `openapi-ts.config.ts` points the
 * generated client here, so every request goes through this function.
 *
 * Call sites pass `throwOnError: true` so TypeScript narrows `data` to non-optional;
 * errors are then surfaced by TanStack Query.
 *
 * `auth` is only consulted for operations the OpenAPI document marks as secured,
 * which is why the API decorates its controllers with `@ApiBearerAuth()`.
 */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseURL,
  axios: instance,
  auth: () => getAccessToken() ?? undefined,
});
