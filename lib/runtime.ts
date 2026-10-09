export type Runtime = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  ALLOW_DEV_IDENTITY?: string;
  RUNNER_ENABLED?: string;
  /** Bearer secret for POST /api/jobs/tick. Unset disables the route. */
  JOB_SECRET?: string;
};

export function runtime(): Runtime {
  return {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    ALLOW_DEV_IDENTITY: process.env.ALLOW_DEV_IDENTITY,
    RUNNER_ENABLED: process.env.RUNNER_ENABLED,
    JOB_SECRET: process.env.JOB_SECRET,
  };
}
