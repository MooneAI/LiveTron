let memory = {
  games: new Map()
};

let sqlClient = null;
let initialized = false;

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

async function getSql() {
  if (!hasDatabase()) return null;
  if (!sqlClient) {
    const { neon } = await import("@neondatabase/serverless");
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

export function newId(size = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (const byte of bytes) value += alphabet[byte % alphabet.length];
  return value;
}

export async function ensureSchema() {
  if (!hasDatabase() || initialized) return;
  const sql = await getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      state JSONB NOT NULL
    )
  `;
  initialized = true;
}

export async function readGame(id) {
  await ensureSchema();
  if (!hasDatabase()) return memory.games.get(id) || null;
  const sql = await getSql();
  const rows = await sql`SELECT state FROM games WHERE id = ${id}`;
  return rows[0]?.state || null;
}

export async function writeGame(game) {
  game.updatedAt = new Date().toISOString();
  await ensureSchema();
  if (!hasDatabase()) {
    memory.games.set(game.id, structuredClone(game));
    return game;
  }
  const sql = await getSql();
  await sql`
    INSERT INTO games (id, state)
    VALUES (${game.id}, ${JSON.stringify(game)})
    ON CONFLICT (id)
    DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
  `;
  return game;
}
