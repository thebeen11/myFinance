'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/hooks/use-auth';

// No charset rule here, matching the API: sign-in is not where a username is
// vetted, and a format complaint would only obscure the real answer, which is
// that the pair is wrong.
const schema = z.object({
  username: z.string().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.input<typeof schema>;

export default function LoginPage() {
  const login = useLogin();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">Welcome back to Erumah.</p>
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            {...form.register('username')}
          />
          {form.formState.errors.username ? (
            <p className="text-destructive text-xs">{form.formState.errors.username.message}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          {form.formState.errors.password ? (
            <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        {/* The API deliberately cannot say which half was wrong, so neither can we. */}
        {login.isError ? (
          <p className="bg-destructive/10 text-destructive rounded-xl px-3.5 py-2.5 text-sm">
            Invalid username or password.
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Have an invite code?{' '}
        <Link href="/register" className="text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}
