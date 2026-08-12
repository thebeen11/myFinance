'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { authLogin, authLogout, authRegister } from '@/api';
import type { LoginDto, RegisterDto } from '@/api';
import { clearTokens, getRefreshToken, setTokens } from '@/lib/auth-storage';

/**
 * Signing in and out both replace whose data the app is showing, so the whole
 * query cache is cleared on each — not invalidated. Invalidation would refetch
 * the previous user's keys while the new user waits.
 */
export const useLogin = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: LoginDto) => (await authLogin({ body, throwOnError: true })).data,
    onSuccess: (tokens) => {
      setTokens(tokens);
      queryClient.clear();
      router.replace('/');
    },
  });
};

export const useRegister = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: RegisterDto) =>
      (await authRegister({ body, throwOnError: true })).data,
    onSuccess: (tokens) => {
      setTokens(tokens);
      queryClient.clear();
      router.replace('/');
    },
  });
};

export const useLogout = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const refreshToken = getRefreshToken();

      // Best effort: the local session ends either way, but telling the server
      // lets it revoke the refresh token instead of leaving it live for 30 days.
      if (refreshToken) {
        await authLogout({ body: { refreshToken } }).catch(() => undefined);
      }
    },
    onSettled: () => {
      clearTokens();
      queryClient.clear();
      router.replace('/login');
    },
  });
};
