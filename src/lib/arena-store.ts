import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import type {
  ArenaParticipantSlot,
  AudienceMember,
  BattlePackage,
  BattleSetupRecord,
  BattleSummary,
  LiveSession,
  OpenClawBindCodeRecord,
  OpenClawBindingInput,
  OpenClawBindingRecord,
  Vote,
  VoteSide,
} from "@/lib/arena-types";

type SQLiteDatabase = {
  exec: (sql: string) => void;
  prepare: <Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
  ) => StatementSync<Row>;
};

const DB_DIR = join(process.cwd(), ".local");
const DB_PATH = join(DB_DIR, "soul-arena.sqlite");

type GlobalArenaStore = typeof globalThis & {
  __soulArenaDb?: SQLiteDatabase;
};

type BattlePackageRow = {
  battle_package_json: string;
};

type AudienceMemberRow = {
  id: string;
  session_id: string;
  display_name: string;
  display_id: string | null;
  avatar_data_url: string | null;
  created_at: string;
};

type LiveSessionRow = {
  session_id: string;
  battle_id: string | null;
  start_at: string | null;
  created_at: string;
  updated_at: string;
};

type SetupRow = {
  battle_setup_json: string;
};

type OpenClawBindingRow = {
  binding_json: string;
};

type OpenClawBindCodeRow = {
  bind_code_json: string;
};

const globalArenaStore = globalThis as GlobalArenaStore;

const ensureColumn = (
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) => {
  const pragma = db.prepare<{
    name: string;
  }>(`PRAGMA table_info(${table})`);
  const columns = pragma.all();

  if (columns.some((item) => item.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

const initDatabase = () => {
  mkdirSync(DB_DIR, { recursive: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      room_title TEXT NOT NULL,
      winner_id TEXT NOT NULL,
      player_display_name TEXT NOT NULL,
      defender_display_name TEXT NOT NULL,
      generation_mode TEXT NOT NULL,
      source_meta_json TEXT NOT NULL,
      participant_refs_json TEXT NOT NULL,
      battle_package_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_battles_created_at
      ON battles(created_at DESC);

    CREATE TABLE IF NOT EXISTS battle_setups (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      origin_battle_id TEXT,
      topic_id TEXT NOT NULL,
      topic_json TEXT NOT NULL,
      participant_refs_json TEXT NOT NULL,
      overrides_json TEXT NOT NULL,
      battle_setup_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_battle_setups_created_at
      ON battle_setups(created_at DESC);

    CREATE TABLE IF NOT EXISTS openclaw_bindings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version TEXT NOT NULL,
      binding_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_openclaw_bindings_session_slot
      ON openclaw_bindings(session_id, slot, updated_at DESC);

    CREATE TABLE IF NOT EXISTS openclaw_bind_codes (
      code TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      bind_code_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_openclaw_bind_codes_session_slot
      ON openclaw_bind_codes(session_id, slot, created_at DESC);

    CREATE TABLE IF NOT EXISTS audience_members (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      display_id TEXT,
      avatar_data_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audience_session
      ON audience_members(session_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS live_sessions (
      session_id TEXT PRIMARY KEY,
      battle_id TEXT,
      start_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      battle_id TEXT NOT NULL,
      side TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_votes_battle ON votes(session_id, battle_id);
  `);

  return db;
};

const db = globalArenaStore.__soulArenaDb ?? initDatabase();

if (!globalArenaStore.__soulArenaDb) {
  globalArenaStore.__soulArenaDb = db;
}

const parseBattlePackage = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as BattlePackage;
};

const parseBattleSetup = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as BattleSetupRecord;
};

const parseOpenClawBinding = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as OpenClawBindingRecord;
};

const parseOpenClawBindCode = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as OpenClawBindCodeRecord;
};

const toBattleSummary = (battle: BattlePackage): BattleSummary => ({
  createdAt: battle.createdAt,
  defenderDisplayName: battle.defender.displayName,
  generationMode: battle.sourceMeta.generationMode,
  id: battle.id,
  originBattleId: battle.originBattleId ?? battle.sourceMeta.originBattleId ?? null,
  participantProviders: battle.participantRefs.map((participant) => participant.provider),
  playerDisplayName: battle.player.displayName,
  roomTitle: battle.roomTitle,
  setupId: battle.setupId ?? battle.sourceMeta.setupId,
  topicId: battle.topic.id,
  topicSource: battle.topic.source ?? battle.sourceMeta.topicSource,
  topicTitle: battle.topic.title,
  winnerId: battle.winnerId,
});

export const saveBattlePackage = (battle: BattlePackage) => {
  ensureColumn(db, "battles", "setup_id", "TEXT");
  ensureColumn(db, "battles", "origin_battle_id", "TEXT");

  const statement = db.prepare(`
    INSERT INTO battles (
      id,
      created_at,
      topic_id,
      room_title,
      winner_id,
      player_display_name,
      defender_display_name,
      generation_mode,
      source_meta_json,
      participant_refs_json,
      battle_package_json,
      setup_id,
      origin_battle_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      created_at = excluded.created_at,
      topic_id = excluded.topic_id,
      room_title = excluded.room_title,
      winner_id = excluded.winner_id,
      player_display_name = excluded.player_display_name,
      defender_display_name = excluded.defender_display_name,
      generation_mode = excluded.generation_mode,
      source_meta_json = excluded.source_meta_json,
      participant_refs_json = excluded.participant_refs_json,
      battle_package_json = excluded.battle_package_json,
      setup_id = excluded.setup_id,
      origin_battle_id = excluded.origin_battle_id
  `);

  statement.run(
    battle.id,
    battle.createdAt,
    battle.topic.id,
    battle.roomTitle,
    battle.winnerId,
    battle.player.displayName,
    battle.defender.displayName,
    battle.sourceMeta.generationMode,
    JSON.stringify(battle.sourceMeta),
    JSON.stringify(battle.participantRefs),
    JSON.stringify(battle),
    battle.setupId ?? battle.sourceMeta.setupId ?? null,
    battle.originBattleId ?? battle.sourceMeta.originBattleId ?? null,
  );
};

export const getBattlePackage = (battleId: string) => {
  const statement = db.prepare<BattlePackageRow>(
    "SELECT battle_package_json FROM battles WHERE id = ?",
  );
  const row = statement.get(battleId);

  return parseBattlePackage(row?.battle_package_json);
};

export const listBattlePackages = ({
  limit,
  order = "desc",
}: {
  limit?: number;
  order?: "asc" | "desc";
} = {}) => {
  const safeOrder = order === "asc" ? "ASC" : "DESC";

  if (typeof limit === "number" && Number.isFinite(limit)) {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const statement = db.prepare<BattlePackageRow>(`
      SELECT battle_package_json
      FROM battles
      ORDER BY created_at ${safeOrder}
      LIMIT ?
    `);

    return statement
      .all(safeLimit)
      .map((row) => parseBattlePackage(row.battle_package_json))
      .filter((battle): battle is BattlePackage => Boolean(battle));
  }

  const statement = db.prepare<BattlePackageRow>(`
    SELECT battle_package_json
    FROM battles
    ORDER BY created_at ${safeOrder}
  `);

  return statement
    .all()
    .map((row) => parseBattlePackage(row.battle_package_json))
    .filter((battle): battle is BattlePackage => Boolean(battle));
};

export const listBattleSummaries = (limit = 50) =>
  listBattlePackages({ limit, order: "desc" }).map(toBattleSummary);

export const saveBattleSetup = (
  setup: Omit<BattleSetupRecord, "createdAt" | "id"> & {
    createdAt?: string;
    id?: string;
  },
) => {
  const record: BattleSetupRecord = {
    ...setup,
    createdAt: setup.createdAt ?? new Date().toISOString(),
    id: setup.id ?? randomUUID(),
  };
  const statement = db.prepare(`
    INSERT INTO battle_setups (
      id,
      created_at,
      origin_battle_id,
      topic_id,
      topic_json,
      participant_refs_json,
      overrides_json,
      battle_setup_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      created_at = excluded.created_at,
      origin_battle_id = excluded.origin_battle_id,
      topic_id = excluded.topic_id,
      topic_json = excluded.topic_json,
      participant_refs_json = excluded.participant_refs_json,
      overrides_json = excluded.overrides_json,
      battle_setup_json = excluded.battle_setup_json
  `);

  statement.run(
    record.id,
    record.createdAt,
    record.originBattleId ?? null,
    record.topicId,
    JSON.stringify(record.topicSnapshot ?? null),
    JSON.stringify(record.participants),
    JSON.stringify(record.overrides ?? {}),
    JSON.stringify(record),
  );

  return record;
};

export const getBattleSetup = (setupId: string) => {
  const statement = db.prepare<SetupRow>(
    "SELECT battle_setup_json FROM battle_setups WHERE id = ?",
  );
  const row = statement.get(setupId);

  return parseBattleSetup(row?.battle_setup_json);
};

export const saveOpenClawBinding = ({
  input,
  sessionId,
  slot,
}: {
  input: OpenClawBindingInput;
  sessionId: string;
  slot: ArenaParticipantSlot;
}) => {
  const now = new Date().toISOString();
  const record: OpenClawBindingRecord = {
    createdAt: now,
    id: randomUUID(),
    sessionId,
    slot,
    updatedAt: now,
    version: now,
    profile: {
      archetype: input.archetype?.trim() || "OpenClaw Persona",
      agentVersion: input.agentVersion?.trim(),
      aura: input.aura?.trim() || "OpenClaw Amber",
      avatarUrl: input.avatarUrl?.trim(),
      declaration: input.declaration.trim(),
      displayId: input.displayId?.trim(),
      displayName: input.displayName.trim(),
      memoryAnchors: input.memoryAnchors.map((item) => item.trim()).filter(Boolean),
      rule: input.rule.trim(),
      runtimeLabel: input.runtimeLabel?.trim() || "OpenClaw Hosted Runtime",
      soulSeedTags: input.soulSeedTags.map((item) => item.trim()).filter(Boolean),
      sourceFile: input.sourceFile?.trim(),
      sourceKind: input.sourceKind ?? "workspace_import",
      sourceLabel: input.sourceLabel?.trim() || "OpenClaw Hosted Config",
      taboo: input.taboo.trim(),
      tags: input.tags.map((item) => item.trim()).filter(Boolean),
      viewpoints: input.viewpoints.map((item) => item.trim()).filter(Boolean),
    },
  };
  const statement = db.prepare(`
    INSERT INTO openclaw_bindings (
      id,
      session_id,
      slot,
      created_at,
      updated_at,
      version,
      binding_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    record.id,
    record.sessionId,
    record.slot,
    record.createdAt,
    record.updatedAt,
    record.version,
    JSON.stringify(record),
  );

  return record;
};

export const getOpenClawBindingById = ({
  bindingId,
  sessionId,
}: {
  bindingId: string;
  sessionId: string;
}) => {
  const statement = db.prepare<OpenClawBindingRow>(
    `
      SELECT binding_json
      FROM openclaw_bindings
      WHERE id = ? AND session_id = ?
      LIMIT 1
    `,
  );
  const row = statement.get(bindingId, sessionId);

  return parseOpenClawBinding(row?.binding_json);
};

export const getLatestOpenClawBindingForSlot = ({
  sessionId,
  slot,
}: {
  sessionId: string;
  slot: ArenaParticipantSlot;
}) => {
  const statement = db.prepare<OpenClawBindingRow>(
    `
      SELECT binding_json
      FROM openclaw_bindings
      WHERE session_id = ? AND slot = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );
  const row = statement.get(sessionId, slot);

  return parseOpenClawBinding(row?.binding_json);
};

export const clearOpenClawBindingsForSlot = ({
  sessionId,
  slot,
}: {
  sessionId: string;
  slot: ArenaParticipantSlot;
}) => {
  const statement = db.prepare(
    "DELETE FROM openclaw_bindings WHERE session_id = ? AND slot = ?",
  );
  statement.run(sessionId, slot);
};

export const saveOpenClawBindCode = ({
  code,
  expiresAt,
  sessionId,
  slot,
}: {
  code: string;
  expiresAt: string;
  sessionId: string;
  slot: ArenaParticipantSlot;
}) => {
  const record: OpenClawBindCodeRecord = {
    code,
    createdAt: new Date().toISOString(),
    expiresAt,
    sessionId,
    slot,
    usedAt: null,
  };
  const statement = db.prepare(`
    INSERT INTO openclaw_bind_codes (
      code,
      session_id,
      slot,
      created_at,
      expires_at,
      used_at,
      bind_code_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    record.code,
    record.sessionId,
    record.slot,
    record.createdAt,
    record.expiresAt,
    record.usedAt,
    JSON.stringify(record),
  );

  return record;
};

export const getOpenClawBindCode = (code: string) => {
  const statement = db.prepare<OpenClawBindCodeRow>(
    "SELECT bind_code_json FROM openclaw_bind_codes WHERE code = ? LIMIT 1",
  );
  const row = statement.get(code);

  return parseOpenClawBindCode(row?.bind_code_json);
};

export const markOpenClawBindCodeUsed = ({
  code,
  usedAt,
}: {
  code: string;
  usedAt: string;
}) => {
  const current = getOpenClawBindCode(code);

  if (!current) {
    return null;
  }

  const next: OpenClawBindCodeRecord = {
    ...current,
    usedAt,
  };
  const statement = db.prepare(`
    UPDATE openclaw_bind_codes
    SET used_at = ?, bind_code_json = ?
    WHERE code = ?
  `);
  statement.run(usedAt, JSON.stringify(next), code);

  return next;
};

export const clearOpenClawBindCodesForSlot = ({
  sessionId,
  slot,
}: {
  sessionId: string;
  slot: ArenaParticipantSlot;
}) => {
  const statement = db.prepare(
    "DELETE FROM openclaw_bind_codes WHERE session_id = ? AND slot = ? AND used_at IS NULL",
  );
  statement.run(sessionId, slot);
};

// ── Audience Members ────────────────────────────────────────────────────────

const toAudienceMember = (row: AudienceMemberRow): AudienceMember => ({
  id: row.id,
  sessionId: row.session_id,
  displayName: row.display_name,
  displayId: row.display_id ?? null,
  avatarDataUrl: row.avatar_data_url ?? null,
  createdAt: row.created_at,
});

export const saveAudienceMember = ({
  sessionId,
  displayName,
  displayId,
  avatarDataUrl,
}: {
  sessionId: string;
  displayName: string;
  displayId?: string;
  avatarDataUrl?: string;
}): AudienceMember => {
  const now = new Date().toISOString();
  const id = randomUUID();
  const statement = db.prepare(`
    INSERT INTO audience_members (id, session_id, display_name, display_id, avatar_data_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  statement.run(id, sessionId, displayName, displayId ?? null, avatarDataUrl ?? null, now);
  return { id, sessionId, displayName, displayId: displayId ?? null, avatarDataUrl: avatarDataUrl ?? null, createdAt: now };
};

export const listAudienceMembers = (sessionId: string): AudienceMember[] => {
  const statement = db.prepare<AudienceMemberRow>(
    "SELECT id, session_id, display_name, display_id, avatar_data_url, created_at FROM audience_members WHERE session_id = ? ORDER BY created_at DESC",
  );
  return statement.all(sessionId).map(toAudienceMember);
};

export const clearAudienceMembers = (sessionId: string) => {
  const statement = db.prepare("DELETE FROM audience_members WHERE session_id = ?");
  statement.run(sessionId);
};

// ── Live Sessions ───────────────────────────────────────────────────────────

const toLiveSession = (row: LiveSessionRow): LiveSession => ({
  sessionId: row.session_id,
  battleId: row.battle_id ?? null,
  startAt: row.start_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const setLiveSession = ({
  sessionId,
  battleId,
  startAt,
}: {
  sessionId: string;
  battleId?: string;
  startAt?: string;
}) => {
  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO live_sessions (session_id, battle_id, start_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      battle_id = excluded.battle_id,
      start_at = excluded.start_at,
      updated_at = excluded.updated_at
  `);
  statement.run(sessionId, battleId ?? null, startAt ?? null, now, now);
};

export const getLiveSession = (sessionId: string): LiveSession | null => {
  const statement = db.prepare<LiveSessionRow>(
    "SELECT session_id, battle_id, start_at, created_at, updated_at FROM live_sessions WHERE session_id = ?",
  );
  const row = statement.get(sessionId);
  return row ? toLiveSession(row) : null;
};

// ── Votes ────────────────────────────────────────────────────────────────────

type VoteRow = {
  id: string;
  session_id: string;
  battle_id: string;
  side: string;
  created_at: string;
};

type VoteCountRow = {
  side: string;
  count: number;
};

const toVote = (row: VoteRow): Vote => ({
  id: row.id,
  sessionId: row.session_id,
  battleId: row.battle_id,
  side: row.side as VoteSide,
  createdAt: row.created_at,
});

export const saveVote = ({
  sessionId,
  battleId,
  side,
}: {
  sessionId: string;
  battleId: string;
  side: VoteSide;
}): Vote => {
  const now = new Date().toISOString();
  const id = randomUUID();
  const statement = db.prepare(`
    INSERT INTO votes (id, session_id, battle_id, side, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  statement.run(id, sessionId, battleId, side, now);
  return toVote({ id, session_id: sessionId, battle_id: battleId, side, created_at: now });
};

export const countVotes = ({
  sessionId,
  battleId,
}: {
  sessionId: string;
  battleId: string;
}): { player: number; defender: number } => {
  const statement = db.prepare<VoteCountRow>(
    "SELECT side, COUNT(*) as count FROM votes WHERE session_id = ? AND battle_id = ? GROUP BY side",
  );
  const rows = statement.all(sessionId, battleId);
  let player = 0;
  let defender = 0;
  for (const row of rows) {
    if (row.side === "player") player = Number(row.count);
    else if (row.side === "defender") defender = Number(row.count);
  }
  return { player, defender };
};
