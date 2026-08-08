# expense-tracker

Local-first expense tracker. Electric (read path) + own API (write path) + TanStack DB (client).

## Prereqs
- Node 24 LTS (`nvm use`)
- pnpm 10+
- Docker + Docker Compose v2
- Android SDK / Android Studio (no Mac → Android only for now)

## Layer 1 — workspace
```
pnpm install
pnpm typecheck
node --experimental-strip-types apps/server/src/index.ts
```
**Checkpoint:** typecheck passes in both packages, and the script prints
`lunch cost: 12.50 (stored as 1250)`. That proves `@et/shared` resolves across
the workspace boundary.

## Layer 2 — Postgres + Electric
```
cp .env.example .env
pnpm db:up
docker compose ps          # both services healthy/running
pnpm electric:logs         # should NOT complain about wal_level
```

Then prove the read path end to end:
```
pnpm db:psql
```
```sql
CREATE TABLE smoke (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note text);
INSERT INTO smoke (note) VALUES ('hello from postgres');
```
```
curl -s 'http://localhost:3000/v1/shape?table=smoke&offset=-1' | head
```
**Checkpoint:** that curl returns your row as JSON. Electric is reading the WAL.

Clean up: `DROP TABLE smoke;`

### If Electric won't start
- `wal_level` complaint → Postgres didn't get the `-c wal_level=logical` command. `pnpm db:nuke` and up again.
- "replication slot is active" → a previous Electric is still holding it. `pnpm db:down` fully, then up.
- Unknown env var `ELECTRIC_INSECURE` → delete that line; the flag name has moved between versions.

## Layer 3 — Express + Drizzle (write path)   [not started]
## Layer 4 — Expo dev build + TanStack DB     [not started]
