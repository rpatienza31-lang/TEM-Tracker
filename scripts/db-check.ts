import "dotenv/config";
import postgres from "postgres";

/**
 * Diagnoses the DATABASE_URL connection: prints the (password-redacted)
 * target, connects, and reports whether the schema is applied — or the exact
 * error if it can't connect. Run: npm run db:check
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL is not set in .env");
    process.exit(1);
  }

  const redacted = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
  console.log("Target:", redacted);

  const sql = postgres(url, { prepare: false, connect_timeout: 10 });
  try {
    const [{ now }] = await sql`select now()`;
    console.log("✅ Connected. Server time:", now);

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`;
    const names = tables.map((t) => t.table_name);
    console.log("Public tables:", names.length ? names.join(", ") : "(none — schema not applied yet)");

    if (names.includes("users")) {
      const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from users`;
      console.log(`users rows: ${count}`);
      if (count === 0) {
        console.log("⚠️  No users row yet — insert one linking your Supabase auth_user_id.");
      }
    } else {
      console.log("⚠️  'users' table missing — run the drizzle/ + supabase/sql/ files first.");
    }
  } catch (e) {
    const err = e as { message?: string; code?: string };
    console.error("❌ Connection/query failed:");
    console.error("   message:", err.message);
    if (err.code) console.error("   code:   ", err.code);
  } finally {
    await sql.end();
  }
}

main();
