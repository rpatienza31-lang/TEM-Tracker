import "dotenv/config";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Point it at a disposable Postgres database (never your dev/prod one) " +
      "before running the test suite — see .env.example.",
  );
}
if (!process.env.TEST_DATABASE_URL.includes("test")) {
  throw new Error('TEST_DATABASE_URL must point at a database with "test" in its name, as a safety guard against wiping real data.');
}

// db/client.ts reads DATABASE_URL lazily on first import, which happens after
// this setup file runs, so pointing it at the test database here is safe.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
