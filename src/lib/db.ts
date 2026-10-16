import "server-only";

/**
 * Singleton connection to `data/pfm.sqlite3` (see `data/schema.md`). Server
 * only — imported exclusively by route handlers under `src/app/api/`, never
 * by client components (architectural invariant #4: the browser reaches this
 * data only through the API routes, never the storage layer directly).
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  const dbPath = path.join(process.cwd(), "data", "pfm.sqlite3");
  const schemaPath = path.join(process.cwd(), "data", "schema.sql");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(readFileSync(schemaPath, "utf8"));
  instance = db;
  return db;
}
