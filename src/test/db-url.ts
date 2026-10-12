/** The disposable test database: TEST_DATABASE_URL, default ssm_test on the dev container. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ssm:ssm@127.0.0.1:5433/ssm_test';
