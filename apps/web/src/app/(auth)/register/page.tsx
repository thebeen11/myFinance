'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegister } from '@/hooks/use-auth';

const schema = z.object({
  // Mirrors the API's rule so the message arrives without a round-trip.
  username: z
    .string()
    .regex(/^[a-z0-9._-]{3,32}$/i, '3–32 letters, digits, dot, underscore or hyphen'),
  password: z.string().min(8, 'Use at least 8 characters'),
  displayName: z.string().max(80).optional(),
  inviteCode: z.string().min(1, 'An invite code is required'),
});

type FormValues = z.input<typeof schema>;

/** The API's status codes are specific; the copy should be too. */
const errorMessage = (error: unknown): string => {
  if (!isAxiosError(error)) return 'Could not create the account.';

  switch (error.response?.status) {
    case 403:
      return 'That invite code is not valid.';
    case 409:
      return 'That username is already taken.';
    default:
      return 'Could not create the account. Please try again.';
  }
};

export default function RegisterPage() {
  const register = useRegister();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', displayName: '', inviteCode: '' },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground text-sm">
          Erumah is invite-only. You need a code from the owner.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) =>
          register.mutate({
            username: values.username,
            password: values.password,
            inviteCode: values.inviteCode,
            displayName: values.displayName || undefined,
          }),
        )}
      >
        <div className="grid gap-2">
          <Label htmlFor="inviteCode">Invite code</Label>
          <Input id="inviteCode" autoFocus {...form.register('inviteCode')} />
          {form.formState.errors.inviteCode ? (
            <p className="text-destructive text-xs">{form.formState.errors.inviteCode.message}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" {...form.register('username')} />
          {form.formState.errors.username ? (
            <p className="text-destructive text-xs">{form.formState.errors.username.message}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              What you sign in with. Letters, digits, dot, underscore or hyphen.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" placeholder="Optional" {...form.register('displayName')} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
          {form.formState.errors.password ? (
            <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            There is no password reset. Store it somewhere safe.
          </p>
        </div>

        {register.isError ? (
          <p className="bg-destructive/10 text-destructive rounded-xl px-3.5 py-2.5 text-sm">
            {errorMessage(register.error)}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={register.isPending}>
          {register.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
