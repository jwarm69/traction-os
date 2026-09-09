export type Runtime = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  OPENAI_API_KEY?: string;
};

export function runtime(): Runtime {
  return {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
}
