/**
 * Reads a required environment variable, failing loudly at boot rather than
 * letting a missing secret surface as a confusing 401 at request time.
 */
export const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set — copy .env.example to apps/api/.env and fill it in`);
  }

  return value;
};
