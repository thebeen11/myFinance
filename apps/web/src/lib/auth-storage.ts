const ACCESS_TOKEN_KEY = 'myfinance.accessToken';
const REFRESH_TOKEN_KEY = 'myfinance.refreshToken';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Tokens live in localStorage, so they are readable by anything running on this
 * origin. That is the accepted trade for a client-rendered app talking to a
 * separate API host; the access token is short-lived and the refresh token is
 * revoked server-side the moment it is replayed.
 *
 * Every read is SSR-guarded — the root layout still renders on the server.
 */
export const getAccessToken = (): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(REFRESH_TOKEN_KEY);

export const setTokens = ({ accessToken, refreshToken }: StoredTokens): void => {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearTokens = (): void => {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
};
