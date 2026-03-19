"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { soulLabels } from "@/lib/arena-presets";
import type {
  ArenaBuildPreview,
  ArenaCompetitorProfile,
  ArenaLeaderboardEntry,
  ArenaParticipantCompetitiveProfile,
  ArenaParticipantRef,
  ArenaParticipantSource,
  BattlePackage,
  BattleSetupRecord,
  BuildCard,
  FighterProfile,
  ParticipantBuildOverride,
  ParticipantProvider,
  SoulStatKey,
  SoulStats,
  TopicPreset,
} from "@/lib/arena-types";

type ArenaMetaResponse = {
  signals: string[];
  topics: TopicPreset[];
};

type ParticipantsResponse = {
  participants: ArenaParticipantSource[];
};

type LeaderboardResponse = {
  featured: ArenaLeaderboardEntry | null;
  leaderboard: ArenaLeaderboardEntry[];
};

type ProfileResponse = {
  profiles: ArenaParticipantCompetitiveProfile[];
};

type SetupResponse = {
  participants: ArenaParticipantSource[];
  setup: BattleSetupRecord;
};

type OpenClawBindCodeResponse = {
  bindCode: string;
  expiresAt: string;
  registerUrl: string;
  slot: "alpha" | "beta";
};

type OpenClawProfileResponse = {
  participant: ArenaParticipantSource | null;
};

type SlotOverrideDraft = {
  declaration: string;
  displayName: string;
  rule: string;
  soulSeedTags: string;
  taboo: string;
  viewpoints: string;
};

type BindCodeState = {
  bindCode: string;
  expiresAt: string;
  registerUrl: string;
} | null;

const battleStorageKey = (battleId: string) => `soul-arena:battle:${battleId}`;

const emptyOverrideDraft = (): SlotOverrideDraft => ({
  declaration: "",
  displayName: "",
  rule: "",
  soulSeedTags: "",
  taboo: "",
  viewpoints: "",
});

async function readJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T;

  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload &&
        "message" in payload &&
        typeof payload.message === "string"
        ? payload.message
        : `请求失败：${response.status}`,
    );
  }

  return payload;
}

const K_FACTOR = 32;
const MIN_RATING_DELTA = 8;
const MAX_RATING_DELTA = 24;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const calculateWinDelta = (winnerRating: number, loserRating: number) => {
  const expectedScore = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  return clamp(Math.round(K_FACTOR * (1 - expectedScore)), MIN_RATING_DELTA, MAX_RATING_DELTA);
};

const formatRank = (profile: ArenaCompetitorProfile | null) =>
  profile?.rank ? `#${profile.rank}` : "未上榜";

const formatLastResult = (profile: ArenaCompetitorProfile | null) => {
  if (!profile?.lastResult) return "尚未开赛";
  return profile.lastResult === "win" ? "上一场获胜" : "上一场失利";
};

const userField = (participant: ArenaParticipantSource | null, field: string) => {
  const value = participant?.user?.[field as keyof typeof participant.user];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const topShades = (participant: ArenaParticipantSource | null) =>
  (participant?.shades ?? [])
    .map((shade) => {
      const value = (shade as { label?: string; name?: string }).label ?? (shade as { label?: string; name?: string }).name;
      return typeof value === "string" ? value.trim() : "";
    })
    .filter(Boolean)
    .slice(0, 4);

const orchestrationLabel = (preview: ArenaBuildPreview | null) => {
  const mode = preview?.sourceMeta.orchestrationMode;
  if (mode === "hybrid") return "混合编排";
  if (mode === "judge_only") return "仅裁判编排";
  if (mode === "deterministic") return "确定性回退";
  return "待生成";
};

const duplicateIdentityWarning =
  "当前甲方和乙方授权成了同一个 SecondMe 账号。这通常是因为第二次授权复用了同一浏览器登录态。";

const getDuplicateIdentityWarning = (participants: ArenaParticipantSource[]) => {
  const connected = participants.filter(
    (participant) =>
      participant.connected &&
      typeof (participant as { secondMeUserId?: string }).secondMeUserId === "string" &&
      ((participant as { secondMeUserId?: string }).secondMeUserId ?? "").trim().length > 0,
  );
  if (connected.length < 2) return null;
  return connected.every(
    (participant) =>
      (participant as { secondMeUserId?: string }).secondMeUserId ===
      (connected[0] as { secondMeUserId?: string }).secondMeUserId,
  )
    ? duplicateIdentityWarning
    : null;
};

const buildMatchupSummary = (
  alphaProfile: ArenaCompetitorProfile | null,
  betaProfile: ArenaCompetitorProfile | null,
) => {
  if (!alphaProfile || !betaProfile) return null;
  const projectedWinDelta = calculateWinDelta(alphaProfile.rating, betaProfile.rating);
  const projectedLossDelta = -calculateWinDelta(betaProfile.rating, alphaProfile.rating);
  const currentTargetIsSuggestion =
    alphaProfile.suggestion?.competitorId === betaProfile.competitorId;
  const reason = currentTargetIsSuggestion
    ? "当前对手就是系统给出的建议挑战对象。"
    : betaProfile.currentStreak >= 2
      ? `若击败对手，可直接终结其 ${betaProfile.currentStreak} 连胜。`
      : alphaProfile.rank && betaProfile.rank && betaProfile.rank < alphaProfile.rank
        ? "这是一场越级挑战，赢下会更有冲榜价值。"
        : "这是一场标准排位战，适合继续积累积分和手感。";
  return {
    projectedLossDelta,
    projectedWinDelta,
    reason,
    stakesLabel:
      betaProfile.currentStreak >= 2
        ? "终结连胜局"
        : alphaProfile.rank && betaProfile.rank && betaProfile.rank < alphaProfile.rank
          ? "冲榜局"
          : "常规排位局",
  };
};

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const splitComma = (value: string) =>
  value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const participantTitle = (slot: "alpha" | "beta") =>
  slot === "alpha" ? "甲方参赛者" : "乙方参赛者";

const participantSubtitle = (participant: ArenaParticipantSource | null) =>
  participant?.displayName ?? "未连接";

const participantRoute = (participant: ArenaParticipantSource | null) =>
  typeof participant?.user?.route === "string" ? participant.user.route : null;

const participantBio = (participant: ArenaParticipantSource | null) =>
  typeof participant?.user?.bio === "string" ? participant.user.bio : null;

const participantDisplayId = (participant: ArenaParticipantSource | null) =>
  participant?.displayId ??
  (typeof participant?.user?.displayId === "string" ? participant.user.displayId : null);

const participantSourceKind = (participant: ArenaParticipantSource | null) =>
  typeof participant?.sourceMeta?.sourceKind === "string"
    ? participant.sourceMeta.sourceKind
    : null;

const participantAvatar = (participant: ArenaParticipantSource | null) =>
  participant?.avatarUrl ??
  (typeof participant?.user?.avatarUrl === "string" ? participant.user.avatarUrl : null);

const tagLabels = (participant: ArenaParticipantSource | null) =>
  (participant?.shades ?? [])
    .map((shade) =>
      typeof shade.label === "string"
        ? shade.label
        : typeof shade.name === "string"
          ? shade.name
          : "",
    )
    .map((item) => item.trim())
    .filter(Boolean);

const memoryAnchors = (participant: ArenaParticipantSource | null) =>
  (participant?.softMemory ?? [])
    .map((memory) =>
      typeof memory.summary === "string"
        ? memory.summary
        : typeof memory.text === "string"
          ? memory.text
          : typeof memory.content === "string"
            ? memory.content
            : typeof memory.title === "string"
              ? memory.title
              : "",
    )
    .map((item) => item.trim())
    .filter(Boolean);

const toRef = (participant: ArenaParticipantSource): ArenaParticipantRef => ({
  participantId: participant.participantId,
  provider: participant.provider,
  slot: participant.slot,
});

const getProfileBySlot = (
  profiles: ArenaParticipantCompetitiveProfile[],
  slot: "alpha" | "beta",
) => profiles.find((entry) => entry.slot === slot)?.profile ?? null;

const draftFromOverride = (override?: ParticipantBuildOverride): SlotOverrideDraft => ({
  declaration: override?.declaration ?? "",
  displayName: override?.displayName ?? "",
  rule: override?.rule ?? "",
  soulSeedTags: (override?.soulSeedTags ?? []).join(", "),
  taboo: override?.taboo ?? "",
  viewpoints: (override?.viewpoints ?? []).join("\n"),
});

const overrideFromDraft = (draft: SlotOverrideDraft): ParticipantBuildOverride => {
  const payload: ParticipantBuildOverride = {};

  if (draft.displayName.trim()) payload.displayName = draft.displayName.trim();
  if (draft.declaration.trim()) payload.declaration = draft.declaration.trim();
  if (draft.rule.trim()) payload.rule = draft.rule.trim();
  if (draft.taboo.trim()) payload.taboo = draft.taboo.trim();

  const viewpoints = splitLines(draft.viewpoints);
  if (viewpoints.length) payload.viewpoints = viewpoints;

  const soulSeedTags = splitComma(draft.soulSeedTags);
  if (soulSeedTags.length) payload.soulSeedTags = soulSeedTags;

  return payload;
};

// ── Build stat bar ─────────────────────────────────────────────────
function StatBar({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', width: '2.6rem', flexShrink: 0, textAlign: 'right' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(60,0,0,0.3)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: accent, boxShadow: `0 0 4px ${accent}`, transition: 'width 400ms ease' }} />
      </div>
      <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.65rem', color: 'var(--text-dim)', width: '1.8rem', flexShrink: 0 }}>
        {value}
      </span>
    </div>
  );
}

// ── Equipment card system ────────────────────────────────────────────
const SLOT_CONFIG = {
  viewpoint: { icon: '⚔', label: 'WEAPON', labelCn: '武器', statKey: 'atk' as const },
  rule:      { icon: '⛨', label: 'ARMOR',  labelCn: '护甲', statKey: 'def' as const },
  taboo:     { icon: '✦', label: 'RELIC',  labelCn: '禁忌器', statKey: 'pen' as const },
} as const;

const RARITY = [
  { pct: 0.75, label: '传说', en: 'LEGENDARY', color: '#ffd700', glow: 'rgba(255,215,0,0.55)', border: '#ffd700' },
  { pct: 0.55, label: '史诗', en: 'EPIC',      color: '#c060ff', glow: 'rgba(180,60,255,0.45)', border: '#b040ee' },
  { pct: 0.35, label: '精良', en: 'RARE',      color: '#4499ff', glow: 'rgba(60,140,255,0.35)', border: '#2277dd' },
  { pct: 0,    label: '普通', en: 'COMMON',    color: '#888888', glow: 'rgba(100,100,100,0.2)', border: '#555555' },
] as const;

// Max possible per-stat: atk≤20, def≤19, pen≤18, spd≤18 → total max ≈ 75
// If values exceed 75 (demo seed uses 60-100 scale), detect and normalise
function getEquipRarity(card: BuildCard) {
  const total = card.atk + card.def + card.pen + card.spd;
  const maxPossible = total > 80 ? 400 : 75; // auto-detect scale
  const pct = total / maxPossible;
  return RARITY.find((r) => pct >= r.pct) ?? RARITY[RARITY.length - 1];
}

function MiniStatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ flex: 1, height: '5px', background: 'rgba(0,0,0,0.5)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}`, borderRadius: '2px' }} />
    </div>
  );
}

function EquipmentCard({ card, isPlayer, sourceText }: { card: BuildCard; isPlayer: boolean; sourceText?: string }) {
  const [expanded, setExpanded] = useState(false);
  const slot = SLOT_CONFIG[card.kind] ?? SLOT_CONFIG.viewpoint;
  const rarity = getEquipRarity(card);
  const teamAccent = isPlayer ? '#cc2200' : '#c8900a';

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      style={{
        position: 'relative',
        background: `linear-gradient(135deg, rgba(0,0,0,0.75) 0%, rgba(10,5,20,0.85) 100%)`,
        border: `1px solid ${rarity.border}`,
        borderTop: `2px solid ${rarity.color}`,
        boxShadow: `0 0 16px ${rarity.glow}, inset 0 0 20px rgba(0,0,0,0.4)`,
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Rarity shimmer line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, transparent, ${rarity.color}, transparent)`, opacity: 0.8 }} />

      {/* Header row: slot icon + type + rarity badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px 5px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{slot.icon}</span>
          <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'rgba(200,200,200,0.55)', textTransform: 'uppercase' }}>
            {slot.label}
          </span>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.58rem', color: 'rgba(150,150,150,0.5)' }}>
            {slot.labelCn}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            fontFamily: 'Impact, Arial Black, sans-serif',
            fontSize: '0.55rem',
            letterSpacing: '0.15em',
            color: rarity.color,
            textTransform: 'uppercase',
            padding: '1px 5px',
            border: `1px solid ${rarity.border}`,
            boxShadow: `0 0 6px ${rarity.glow}`,
          }}>
            {rarity.label} · {rarity.en}
          </span>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.55rem', color: 'rgba(150,150,150,0.4)' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Item body */}
      <div style={{ padding: '10px 12px 8px' }}>
        {/* Item name + trait */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: rarity.color, textShadow: `0 0 12px ${rarity.glow}`, lineHeight: 1.15 }}>
            {card.title}
          </div>
          <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: teamAccent, background: 'rgba(0,0,0,0.5)', padding: '1px 6px', border: `1px solid ${teamAccent}44` }}>
              {card.trait}
            </span>
          </div>
        </div>

        {/* Compact 2-col stat bars — auto-detect 0-20 vs 0-100 scale */}
        {(() => {
          const isHighScale = card.atk > 25 || card.def > 25;
          const maxAtk = isHighScale ? 100 : 20;
          const maxDef = isHighScale ? 100 : 20;
          const maxPen = isHighScale ? 100 : 18;
          const maxSpd = isHighScale ? 100 : 18;
          return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
          {[
            { key: 'ATK', val: card.atk, max: maxAtk, color: '#ff4422' },
            { key: 'DEF', val: card.def, max: maxDef, color: '#c8900a' },
            { key: 'PEN', val: card.pen, max: maxPen, color: '#9933ff' },
            { key: 'SPD', val: card.spd, max: maxSpd, color: '#1188cc' },
          ].map(({ key, val, max, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.55rem', color: color, width: '1.8rem', flexShrink: 0, letterSpacing: '0.05em' }}>{key}</span>
              <MiniStatBar value={Math.min(val, max)} max={max} color={color} />
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', color: 'rgba(220,220,220,0.75)', width: '1.8rem', flexShrink: 0, textAlign: 'right' }}>{val}</span>
            </div>
          ))}
        </div>
          );
        })()}
      </div>

      {/* Expanded: full text + source + hint */}
      {expanded && (
        <div style={{ padding: '0 12px 10px', borderTop: `1px solid rgba(255,255,255,0.06)` }}>
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: '1.7', paddingLeft: '8px', borderLeft: `2px solid ${rarity.border}55`, marginTop: '8px' }}>
            {card.text}
          </p>
          {sourceText && (
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px' }}>
              ↳ 来源：{sourceText}
            </p>
          )}
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.64rem', color: rarity.color, opacity: 0.7, marginTop: '8px', paddingTop: '6px', borderTop: `1px solid rgba(255,255,255,0.05)` }}>
            💡 {card.hint}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Soul stats block ────────────────────────────────────────────────
function SoulStatsBlock({ soul, isPlayer }: { soul: SoulStats; isPlayer: boolean }) {
  const accent = isPlayer ? 'var(--red)' : 'var(--gold)';
  return (
    <div className="flex flex-col gap-1">
      {(Object.keys(soulLabels) as SoulStatKey[]).map((key) => (
        <StatBar key={key} label={soulLabels[key]} value={soul[key]} max={99} accent={accent} />
      ))}
    </div>
  );
}

// ── Fighter build derivation panel ─────────────────────────────────
function BuildDerivationPanel({
  fighter,
  participant,
  isPlayer,
}: {
  fighter: FighterProfile;
  participant: ArenaParticipantSource | null;
  isPlayer: boolean;
}) {
  const accent = isPlayer ? 'var(--red)' : 'var(--gold)';
  const shades = (participant?.shades ?? [])
    .map((s) => (s.label ?? s.name ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);
  const memories = (participant?.softMemory ?? [])
    .map((m) => (m.summary ?? m.text ?? m.content ?? m.title ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  // Map card index to source: viewpoint[0]→memory[0], viewpoint[1]→shades, viewpoint[2]→identitySummary
  const cardSources = [
    memories[0] ? `软记忆：${memories[0].slice(0, 60)}…` : undefined,
    shades.length ? `人格标签：${shades.join('、')}` : undefined,
    fighter.identitySummary[1] ?? fighter.identitySummary[0] ?? undefined,
    undefined, // rule card — default rule
    undefined, // taboo card — default taboo
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Soul stats */}
      <div className="mk-panel-inset p-3">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, marginBottom: '10px' }}>
          魂核属性 · Soul Stats
        </p>
        <SoulStatsBlock soul={fighter.soul} isPlayer={isPlayer} />
        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.5' }}>
          由装备卡数值（atk/def/pen/spd）+ 人格标签推导而来。
        </p>
      </div>

      {/* Equipment rack */}
      <div className="flex flex-col gap-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, margin: 0 }}>
            装备栏 · Equipment
          </p>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(90deg, ${accent}66, transparent)` }} />
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.58rem', color: 'rgba(150,150,150,0.5)' }}>
            {fighter.cards.length} / 3 槽
          </span>
        </div>
        {fighter.cards.map((card, i) => (
          <EquipmentCard
            key={card.id}
            card={card}
            isPlayer={isPlayer}
            sourceText={cardSources[i]}
          />
        ))}
      </div>

      {/* Source trace */}
      {(shades.length > 0 || memories.length > 0) && (
        <div className="mk-panel-inset p-3">
          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, marginBottom: '8px' }}>
            构筑溯源
          </p>
          {shades.length > 0 && (
            <div className="mb-2">
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                人格标签 → soulSeedTags → Soul 属性加成
              </p>
              <div className="flex flex-wrap gap-1">
                {shades.map((shade) => (
                  <span key={shade} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: accent, background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(60,0,0,0.3)`, padding: '1px 6px' }}>
                    {shade}
                  </span>
                ))}
              </div>
            </div>
          )}
          {memories.map((mem, i) => (
            <div key={i} className="mb-1">
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                <span style={{ color: accent }}>软记忆 {i + 1}</span> → 观点卡 {i + 1} 文本
              </p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: '1.5' }}>
                「{mem.slice(0, 80)}{mem.length > 80 ? '…' : ''}」
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Avatar uploader + AI sprite ──────────────────────────────────
const avatarStorageKey = (slot: "alpha" | "beta") => `soul-arena:avatar:${slot}`;
const spriteStorageKey = (slot: "alpha" | "beta") => `soul-arena:sprite:${slot}`;

function AvatarUploader({
  slot, isAlpha, participantName, participantTags,
}: {
  slot: "alpha" | "beta";
  isAlpha: boolean;
  participantName: string | null;
  participantTags: string[];
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(avatarStorageKey(slot)) : null,
  );
  const [spriteUrl, setSpriteUrl] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(spriteStorageKey(slot)) : null,
  );
  const [generating, setGenerating] = useState(false);
  const accent = isAlpha ? "var(--red)" : "var(--gold)";
  const accentGlow = isAlpha ? "rgba(200,0,0,0.55)" : "rgba(212,160,0,0.5)";

  const displayed = dataUrl ?? spriteUrl;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      localStorage.setItem(avatarStorageKey(slot), result);
      setDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    localStorage.removeItem(avatarStorageKey(slot));
    setDataUrl(null);
  };

  const handleGenerateSprite = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/arena/generate-sprite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: participantName ?? slot, tags: participantTags, slot }),
      });
      if (res.ok) {
        const { dataUrl: generated } = (await res.json()) as { dataUrl?: string };
        if (generated) {
          localStorage.setItem(spriteStorageKey(slot), generated);
          setSpriteUrl(generated);
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleClearSprite = () => {
    localStorage.removeItem(spriteStorageKey(slot));
    setSpriteUrl(null);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Portrait / sprite preview */}
      <div style={{
        width: '88px', height: '88px', borderRadius: '50%',
        border: `3px solid ${accent}`,
        boxShadow: `0 0 16px ${accentGlow}, inset 0 0 10px rgba(0,0,0,0.8)`,
        overflow: 'hidden', background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {displayed ? (
          <img alt="fighter" src={displayed} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : generating ? (
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.55rem', color: accent, textAlign: 'center', padding: '4px' }}>生成中…</span>
        ) : (
          <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '2.2rem', color: accent, opacity: 0.35 }}>?</span>
        )}
      </div>

      {/* Upload avatar */}
      <div className="flex gap-1 flex-wrap justify-center">
        <label style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', letterSpacing: '0.08em', color: accent, border: `1px solid ${accentGlow}`, padding: '3px 7px', cursor: 'pointer', background: 'rgba(0,0,0,0.5)' }}>
          上传头像
          <input accept="image/*" style={{ display: 'none' }} type="file" onChange={handleFile} />
        </label>
        {dataUrl && (
          <button onClick={handleClear} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.62rem', color: 'var(--text-muted)', border: '1px solid rgba(60,0,0,0.3)', padding: '3px 7px', background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }} type="button">移除</button>
        )}
      </div>

      {/* AI Sprite generation */}
      {participantName && (
        <div className="flex gap-1 flex-wrap justify-center">
          <button
            disabled={generating}
            onClick={() => void handleGenerateSprite()}
            style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', letterSpacing: '0.06em', color: generating ? 'var(--text-muted)' : accent, border: `1px solid ${generating ? 'rgba(60,0,0,0.2)' : accentGlow}`, padding: '3px 7px', background: 'rgba(0,0,0,0.5)', cursor: generating ? 'default' : 'pointer' }}
            type="button"
          >
            {generating ? "生成中…" : spriteUrl ? "重新生成" : "AI 生成角色"}
          </button>
          {spriteUrl && !dataUrl && (
            <button onClick={handleClearSprite} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', border: '1px solid rgba(60,0,0,0.2)', padding: '3px 7px', background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }} type="button">清除</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fighter info card (shared for alpha & beta) ──────────────────
function FighterCard({
  participant,
  profile,
  slot,
  opponentProfile,
  duplicateWarning,
  override,
  onConnect,
  onDisconnect,
  onOverrideChange,
}: {
  participant: ArenaParticipantSource | null;
  profile: ArenaCompetitorProfile | null;
  slot: "alpha" | "beta";
  opponentProfile: ArenaCompetitorProfile | null;
  duplicateWarning: string | null;
  override: ParticipantBuildOverride;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
  onOverrideChange: (next: ParticipantBuildOverride) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const isAlpha = slot === "alpha";
  const panelClass = isAlpha ? "mk-fighter-card" : "mk-fighter-card-gold";
  const labelColor = isAlpha ? "var(--red)" : "var(--gold)";
  const accentColor = isAlpha ? "var(--red)" : "var(--gold-bright)";

  return (
    <article className={`${panelClass} p-6 flex flex-col gap-5`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <AvatarUploader
            isAlpha={isAlpha}
            participantName={participant?.displayName ?? null}
            participantTags={topShades(participant)}
            slot={slot}
          />
          <div>
            <div className="mk-label mb-2" style={{ color: labelColor }}>
              {participantTitle(slot)}
            </div>
            <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1.3rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: accentColor, textShadow: isAlpha ? '0 0 12px rgba(200,0,0,0.4)' : '0 0 12px rgba(255,215,0,0.35)' }}>
              {participantSubtitle(participant)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!participant?.connected ? (
            <button
              className="mk-button px-4 py-2"
              onClick={onConnect}
              type="button"
              style={isAlpha ? {} : { background: 'linear-gradient(180deg, var(--gold) 0%, #7a5500 100%)', borderColor: 'var(--gold-bright)', color: '#1a0000' }}
            >
              连接 SecondMe
            </button>
          ) : (
            <>
              {slot === "beta" && duplicateWarning ? (
                <button
                  className="mk-button px-4 py-2"
                  onClick={onConnect}
                  type="button"
                >
                  重新连接乙方
                </button>
              ) : null}
              <button
                className="mk-button-ghost px-4 py-2"
                onClick={() => void onDisconnect()}
                type="button"
              >
                断开连接
              </button>
            </>
          )}
        </div>
      </div>

      {/* Competitive Profile */}
      <div className="mk-panel-inset p-4">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: labelColor, marginBottom: '10px' }}>
          竞技档案
        </p>
        {profile ? (
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '2' }}>
            <p>排名：<span style={{ color: accentColor }}>{formatRank(profile)}</span> · 积分：<span style={{ color: accentColor }}>{profile.rating}</span></p>
            <p>{profile.wins} 胜 {profile.losses} 负 · 胜率 {profile.winRate}%</p>
            <p>当前连胜：{profile.currentStreak} · 最高连胜 {profile.bestStreak}</p>
            <p>最近结果：{formatLastResult(profile)}</p>
            <p>近况：{profile.recentForm.join(" ") || "暂无"}</p>
            {profile.suggestion ? (
              <p style={{ marginTop: '6px', color: 'var(--text-dim)' }}>
                {profile.suggestion.competitorId === opponentProfile?.competitorId
                  ? `当前对手就是建议挑战对象，胜出预计 +${profile.suggestion.projectedWinDelta}。`
                  : `建议挑战：${profile.suggestion.displayName}，胜出预计 +${profile.suggestion.projectedWinDelta}。`}
              </p>
            ) : null}
          </div>
        ) : (
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            连接后会在这里出现积分、连胜和建议挑战对象。
          </p>
        )}
      </div>

      {/* Auth */}
      <div className="mk-panel-inset p-4">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: labelColor, marginBottom: '8px' }}>
          授权说明
        </p>
        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.75' }}>
          {slot === "alpha"
            ? "甲方可以直接在当前窗口完成授权。"
            : "乙方建议使用隐身窗口或另一浏览器完成授权，避免复用甲方的 SecondMe 登录态。"}
        </p>
      </div>

      {/* Identity */}
      <div className="mk-panel-inset p-4">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: labelColor, marginBottom: '8px' }}>
          身份信息
        </p>
        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.8' }}>
          主页路径：{userField(participant, "route") ?? "无"}
        </p>
        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.8' }}>
          简介：{userField(participant, "bio") ?? "无"}
        </p>
      </div>

      {/* Shades */}
      <div className="mk-panel-inset p-4">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: labelColor, marginBottom: '10px' }}>
          核心标签
        </p>
        <div className="flex flex-wrap gap-2">
          {topShades(participant).length ? (
            topShades(participant).map((shade) => (
              <span key={shade} className={isAlpha ? "mk-badge" : "mk-badge-gold"}>
                {shade}
              </span>
            ))
          ) : (
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem', color: 'var(--text-muted)' }}>当前没有可用标签。</p>
          )}
        </div>
      </div>

      {/* Memory */}
      <div className="mk-panel-inset p-4">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: labelColor, marginBottom: '10px' }}>
          软记忆锚点
        </p>
        <div className="flex flex-col gap-2">
          {memoryAnchors(participant).length ? (
            memoryAnchors(participant).map((memory) => (
              <p key={memory} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.7' }}>
                {memory}
              </p>
            ))
          ) : (
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem', color: 'var(--text-muted)' }}>当前没有可用软记忆。</p>
          )}
        </div>
      </div>

      {/* Override inputs */}
      <div className="mk-panel-inset p-4">
        <button
          className="flex w-full items-center justify-between"
          onClick={() => setOverrideOpen((v) => !v)}
          type="button"
        >
          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: labelColor }}>
            自定义覆盖
          </p>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {overrideOpen ? "▲ 收起" : "▼ 展开"}
          </span>
        </button>

        {overrideOpen && (
          <div className="flex flex-col gap-3 mt-4">
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              覆盖会叠加在 SecondMe 自动生成的构筑之上，留空则使用默认值。
            </p>

            {/* Declaration */}
            <label className="flex flex-col gap-1">
              <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.66rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: labelColor }}>出场宣言</span>
              <textarea
                className="mk-input"
                placeholder="留空则自动生成…"
                rows={2}
                style={{ resize: 'vertical' }}
                value={override.declaration ?? ""}
                onChange={(e) => onOverrideChange({ ...override, declaration: e.target.value || undefined })}
              />
            </label>

            {/* Viewpoints */}
            {[0, 1, 2].map((i) => (
              <label key={i} className="flex flex-col gap-1">
                <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.66rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: labelColor }}>
                  观点 {i + 1}
                </span>
                <input
                  className="mk-input"
                  placeholder="留空则自动生成…"
                  type="text"
                  value={(override.viewpoints ?? [])[i] ?? ""}
                  onChange={(e) => {
                    const next = [...(override.viewpoints ?? ["", "", ""])];
                    next[i] = e.target.value;
                    onOverrideChange({ ...override, viewpoints: next.every((v) => !v) ? undefined : next });
                  }}
                />
              </label>
            ))}

            {/* Rule */}
            <label className="flex flex-col gap-1">
              <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.66rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: labelColor }}>规则</span>
              <input
                className="mk-input"
                placeholder="留空则自动生成…"
                type="text"
                value={override.rule ?? ""}
                onChange={(e) => onOverrideChange({ ...override, rule: e.target.value || undefined })}
              />
            </label>

            {/* Taboo */}
            <label className="flex flex-col gap-1">
              <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.66rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: labelColor }}>禁忌</span>
              <input
                className="mk-input"
                placeholder="留空则自动生成…"
                type="text"
                value={override.taboo ?? ""}
                onChange={(e) => onOverrideChange({ ...override, taboo: e.target.value || undefined })}
              />
            </label>
          </div>
        )}
      </div>

      {/* Issues */}
      {participant?.issues.length ? (
        <div className="mk-warning">
          {participant.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
          {slot === "beta" && duplicateWarning ? (
            <p style={{ marginTop: '8px' }}>
              建议点击上方"重新连接乙方"，并在隐身窗口或另一浏览器里完成登录。
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ArenaBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [meta, setMeta] = useState<ArenaMetaResponse | null>(null);
  const [participants, setParticipants] = useState<ArenaParticipantSource[]>([]);
  const [profiles, setProfiles] = useState<ArenaParticipantCompetitiveProfile[]>([]);
  const [leaderboard, setLeaderboard] = useState<ArenaLeaderboardEntry[]>([]);
  const [featured, setFeatured] = useState<ArenaLeaderboardEntry | null>(null);
  const [alphaOverride, setAlphaOverride] = useState<ParticipantBuildOverride>({});
  const [betaOverride, setBetaOverride] = useState<ParticipantBuildOverride>({});
  const [topicId, setTopicId] = useState("");
  const [topicSnapshot, setTopicSnapshot] = useState<TopicPreset | null>(null);
  const [participantRefs, setParticipantRefs] = useState<Record<"alpha" | "beta", ArenaParticipantRef | null>>({
    alpha: null,
    beta: null,
  });
  const [overrideDrafts, setOverrideDrafts] = useState<Record<"alpha" | "beta", SlotOverrideDraft>>({
    alpha: emptyOverrideDraft(),
    beta: emptyOverrideDraft(),
  });
  const [preview, setPreview] = useState<ArenaBuildPreview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadedSetup, setLoadedSetup] = useState<BattleSetupRecord | null>(null);
  const [bindCodes, setBindCodes] = useState<Record<"alpha" | "beta", BindCodeState>>({
    alpha: null,
    beta: null,
  });
  const [pendingSlot, setPendingSlot] = useState<"alpha" | "beta" | null>(null);
  const setupId = searchParams.get("setupId");

  const alpha = useMemo(
    () => participants.find((participant) => participant.slot === "alpha") ?? null,
    [participants],
  );
  const beta = useMemo(
    () => participants.find((participant) => participant.slot === "beta") ?? null,
    [participants],
  );
  const alphaProfile = useMemo(() => getProfileBySlot(profiles, "alpha"), [profiles]);
  const betaProfile = useMemo(() => getProfileBySlot(profiles, "beta"), [profiles]);
  const selectedTopic = useMemo(
    () => meta?.topics.find((topic) => topic.id === topicId) ?? topicSnapshot,
    [meta?.topics, topicId, topicSnapshot],
  );
  const readyToBuild = Boolean(
    topicId &&
      participantRefs.alpha &&
      participantRefs.beta &&
      alpha?.connected &&
      beta?.connected,
  );
  const duplicateWarning = useMemo(
    () => getDuplicateIdentityWarning(participants),
    [participants],
  );
  const matchupSummary = useMemo(
    () => buildMatchupSummary(alphaProfile, betaProfile),
    [alphaProfile, betaProfile],
  );

  // Auto-generate sprites when a participant connects and has no sprite cached
  useEffect(() => {
    const slots: Array<{ slot: "alpha" | "beta"; participant: typeof alpha }> = [
      { slot: "alpha", participant: alpha },
      { slot: "beta", participant: beta },
    ];
    for (const { slot, participant } of slots) {
      if (!participant?.connected || !participant.displayName) continue;
      const key = `soul-arena:sprite:${slot}`;
      if (typeof window !== "undefined" && localStorage.getItem(key)) continue;
      const tags = topShades(participant);
      fetch("/api/arena/generate-sprite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: participant.displayName, tags, slot }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data: { dataUrl?: string } | null) => {
          if (data?.dataUrl && typeof window !== "undefined") {
            localStorage.setItem(key, data.dataUrl);
          }
        })
        .catch(() => { /* silent — AvatarUploader manual button is the fallback */ });
    }
  }, [alpha?.connected, beta?.connected, alpha?.displayName, beta?.displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadArenaData = async () => {
    const [nextMeta, nextParticipants, nextProfiles, nextLeaderboard] = await Promise.all([
      readJson<ArenaMetaResponse>("/api/arena/topics"),
      readJson<ParticipantsResponse>("/api/participants"),
      readJson<ProfileResponse>("/api/arena/profile?slot=alpha&slot=beta"),
      readJson<LeaderboardResponse>("/api/arena/leaderboard?limit=5"),
    ]);

    return {
      featured: nextLeaderboard.featured,
      leaderboard: nextLeaderboard.leaderboard,
      meta: nextMeta,
      participants: nextParticipants.participants,
      profiles: nextProfiles.profiles,
    };
  };

  const applyArenaData = (data: Awaited<ReturnType<typeof loadArenaData>>) => {
    setMeta(data.meta);
    setParticipants(data.participants);
    setProfiles(data.profiles);
    setLeaderboard(data.leaderboard);
    setFeatured(data.featured);
    setTopicId((current) => current || data.meta.topics[0]?.id || "");
    setParticipantRefs((current) => {
      const nextAlpha = data.participants.find((item) => item.slot === "alpha") ?? null;
      const nextBeta = data.participants.find((item) => item.slot === "beta") ?? null;

      return {
        alpha: current.alpha ?? (nextAlpha ? toRef(nextAlpha) : null),
        beta: current.beta ?? (nextBeta ? toRef(nextBeta) : null),
      };
    });
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await loadArenaData();

        if (!active) {
          return;
        }

        startTransition(() => {
          setMeta(data.meta);
          setParticipants(data.participants);
          setProfiles(data.profiles);
          setLeaderboard(data.leaderboard);
          setFeatured(data.featured);
          setTopicId((current) => current || data.meta.topics[0]?.id || "");
          setParticipantRefs((current) => {
            const nextAlpha = data.participants.find((item) => item.slot === "alpha") ?? null;
            const nextBeta = data.participants.find((item) => item.slot === "beta") ?? null;

            return {
              alpha: current.alpha ?? (nextAlpha ? toRef(nextAlpha) : null),
              beta: current.beta ?? (nextBeta ? toRef(nextBeta) : null),
            };
          });
        });
      } catch (error) {
        if (active) {
          setStatus(error instanceof Error ? error.message : "载入竞技场数据失败。");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!setupId) {
      return;
    }

    void (async () => {
      try {
        const payload = await readJson<SetupResponse>(`/api/arena/setups/${setupId}`);
        setLoadedSetup(payload.setup);
        setParticipants(payload.participants);
        setParticipantRefs({
          alpha: payload.setup.participants.find((item) => item.slot === "alpha") ?? null,
          beta: payload.setup.participants.find((item) => item.slot === "beta") ?? null,
        });
        setOverrideDrafts({
          alpha: draftFromOverride(payload.setup.overrides?.alpha),
          beta: draftFromOverride(payload.setup.overrides?.beta),
        });
        setTopicId(payload.setup.topicId);
        setTopicSnapshot(payload.setup.topicSnapshot ?? null);
        setStatus("已载入重开模板。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "载入重开模板失败。");
      }
    })();
  }, [setupId]);

  useEffect(() => {
    const slotsToPoll = (["alpha", "beta"] as const).filter((slot) => {
      const participant = slot === "alpha" ? alpha : beta;
      return Boolean(bindCodes[slot] && participant?.provider === "openclaw" && !participant.connected);
    });

    if (!slotsToPoll.length) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        const data = await loadArenaData().catch(() => null);

        if (!data) {
          return;
        }

        setMeta(data.meta);
        setParticipants(data.participants);
        setProfiles(data.profiles);
        setLeaderboard(data.leaderboard);
        setFeatured(data.featured);
        setTopicId((current) => current || data.meta.topics[0]?.id || "");
        setParticipantRefs((current) => {
          const nextAlpha = data.participants.find((item) => item.slot === "alpha") ?? null;
          const nextBeta = data.participants.find((item) => item.slot === "beta") ?? null;

          return {
            alpha: current.alpha ?? (nextAlpha ? toRef(nextAlpha) : null),
            beta: current.beta ?? (nextBeta ? toRef(nextBeta) : null),
          };
        });
        setBindCodes((current) => ({
          alpha: data.participants.find((item) => item.slot === "alpha" && item.connected) ? null : current.alpha,
          beta: data.participants.find((item) => item.slot === "beta" && item.connected) ? null : current.beta,
        }));
      })();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [alpha, beta, bindCodes]);

  const switchProvider = async (slot: "alpha" | "beta", provider: ParticipantProvider) => {
    await readJson("/api/participants", {
      body: JSON.stringify({ provider, slot }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const data = await loadArenaData();
    applyArenaData(data);
    const participant = data.participants.find((item) => item.slot === slot) ?? null;

    if (provider === "secondme" && !participant?.connected) {
      window.location.assign(`/api/auth/login?slot=${slot}&returnTo=/arena`);
      return;
    }

    if (provider === "openclaw") {
      setStatus(`已将${participantTitle(slot)}切换到 OpenClaw，请生成绑定码并在用户自己的 OpenClaw 技能中完成注册。`);
      return;
    }

    setStatus(`${participantTitle(slot)}已切换到 ${provider}。`);
  };

  const connectParticipant = (slot: "alpha" | "beta") => {
    window.location.assign(`/api/auth/login?slot=${slot}&returnTo=/arena`);
  };

  const disconnectParticipant = async (slot: "alpha" | "beta") => {
    await readJson(`/api/participants?slot=${slot}`, {
      method: "DELETE",
    });
    setPreview(null);
    setBindCodes((current) => ({
      ...current,
      [slot]: null,
    }));
    const data = await loadArenaData();
    applyArenaData(data);
    setStatus(`${participantTitle(slot)}已断开连接。`);
  };

  const buildOverridesPayload = () => {
    const overrides: Partial<Record<"alpha" | "beta", ParticipantBuildOverride>> = {};
    const hasAlpha = Object.values(alphaOverride).some(Boolean);
    const hasBeta = Object.values(betaOverride).some(Boolean);
    if (hasAlpha) overrides.alpha = alphaOverride;
    if (hasBeta) overrides.beta = betaOverride;
    return Object.keys(overrides).length ? overrides : undefined;
  };

  const generateBindCode = async (slot: "alpha" | "beta") => {
    setPendingSlot(slot);

    try {
      const payload = await readJson<OpenClawBindCodeResponse>("/api/openclaw/bind-code", {
        body: JSON.stringify({ slot }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      setBindCodes((current) => ({
        ...current,
        [slot]: {
          bindCode: payload.bindCode,
          expiresAt: payload.expiresAt,
          registerUrl: payload.registerUrl,
        },
      }));

      const data = await loadArenaData();
      applyArenaData(data);
      setStatus(`${participantTitle(slot)}绑定码已生成，请让 OpenClaw 技能调用 ${payload.registerUrl} 完成注册。`);
    } finally {
      setPendingSlot(null);
    }
  };

  const refreshOpenClawSlot = async (slot: "alpha" | "beta") => {
    const payload = await readJson<OpenClawProfileResponse>(`/api/openclaw/profile?slot=${slot}`);

    if (payload.participant?.connected) {
      setParticipants((current) => [
        ...current.filter((item) => item.slot !== slot),
        payload.participant as ArenaParticipantSource,
      ]);
      setParticipantRefs((current) => ({
        ...current,
        [slot]: toRef(payload.participant as ArenaParticipantSource),
      }));
      setBindCodes((current) => ({
        ...current,
        [slot]: null,
      }));
      setStatus(`已检测到来自 OpenClaw 的${participantTitle(slot)}注册。`);
      return;
    }

    setStatus(`${participantTitle(slot)}仍在等待 OpenClaw 注册完成。`);
  };

  const previewBuild = async () => {
    if (!readyToBuild || !participantRefs.alpha || !participantRefs.beta || !selectedTopic) {
      setStatus("请先连接双方参赛者并选择辩题。");
      return;
    }

    const overrides = {
      alpha: overrideFromDraft(overrideDrafts.alpha),
      beta: overrideFromDraft(overrideDrafts.beta),
    };

    const payload = await readJson<ArenaBuildPreview>("/api/arena/build-preview", {
      body: JSON.stringify({
        originBattleId: loadedSetup?.originBattleId ?? null,
        overrides,
        participants: [participantRefs.alpha, participantRefs.beta],
        topicId,
        topicSnapshot: selectedTopic,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    startTransition(() => {
      setPreview(payload);
      setStatus("预览已更新。");
    });
  };

  const startBattle = async () => {
    if (!readyToBuild || !participantRefs.alpha || !participantRefs.beta || !selectedTopic) {
      setStatus("请先连接双方参赛者并选择辩题。");
      return;
    }

    const overrides = {
      alpha: overrideFromDraft(overrideDrafts.alpha),
      beta: overrideFromDraft(overrideDrafts.beta),
    };

    const battle = await readJson<BattlePackage>("/api/arena/battles", {
      body: JSON.stringify({
        originBattleId: loadedSetup?.originBattleId ?? null,
        overrides,
        participants: [participantRefs.alpha, participantRefs.beta],
        topicId,
        topicSnapshot: selectedTopic,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    localStorage.setItem(battleStorageKey(battle.id), JSON.stringify(battle));
    router.push(`/arena/${battle.id}`);
  };

  const renderOpenClawPanel = (slot: "alpha" | "beta", participant: ArenaParticipantSource | null) => {
    if (participant?.provider !== "openclaw") {
      return null;
    }

    const bindCode = bindCodes[slot];
    const isAlpha = slot === "alpha";
    const accentColor = isAlpha ? 'var(--red)' : 'var(--gold)';
    const accentGlow = isAlpha ? 'rgba(200,0,0,0.4)' : 'rgba(212,160,0,0.4)';

    const copyBindCode = (code: string) => {
      void navigator.clipboard.writeText(code);
    };

    return (
      <div className="mt-4 mk-panel-inset p-4 flex flex-col gap-3">
        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.72rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: accentColor }}>
          OpenClaw 注册
        </p>
        {participant.connected ? (
          <>
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.8' }}>
              已注册为 <span style={{ color: accentColor }}>{participant.displayName ?? "未命名角色"}</span>
              {participantDisplayId(participant) ? ` (@${participantDisplayId(participant)})` : ""}
            </p>
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              版本 {participant.configVersion ?? "当前"} · {participant.sourceLabel ?? "OpenClaw 技能"}
            </p>
            {tagLabels(participant).length ? (
              <div className="flex flex-wrap gap-2">
                {tagLabels(participant).slice(0, 6).map((tag) => (
                  <span key={tag} className={isAlpha ? "mk-badge" : "mk-badge-gold"}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {memoryAnchors(participant).length ? (
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: '1.7' }}>
                {memoryAnchors(participant).slice(0, 3).map((item) => (
                  <p key={item} style={{ marginBottom: '4px' }}>{item}</p>
                ))}
              </div>
            ) : null}
          </>
        ) : bindCode ? (
          <>
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.7' }}>
              请在用户自己的 OpenClaw 技能中使用这个绑定码，并调用注册接口。
            </p>
            {/* Dramatic bind code display */}
            <div style={{
              background: 'rgba(0,0,0,0.85)',
              border: `1px solid ${accentColor}`,
              boxShadow: `0 0 18px ${accentGlow}, inset 0 0 20px rgba(0,0,0,0.5)`,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <code style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: '1.25rem',
                  letterSpacing: '0.18em',
                  color: accentColor,
                  textShadow: `0 0 12px ${accentGlow}`,
                  fontWeight: 'bold',
                  wordBreak: 'break-all',
                }}>
                  {bindCode.bindCode}
                </code>
                <button
                  onClick={() => copyBindCode(bindCode.bindCode)}
                  style={{
                    flexShrink: 0,
                    fontFamily: 'Impact, Arial Black, sans-serif',
                    fontSize: '0.62rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: accentColor,
                    border: `1px solid ${accentColor}`,
                    padding: '4px 10px',
                    background: 'rgba(0,0,0,0.6)',
                    cursor: 'pointer',
                  }}
                  type="button"
                >
                  复制
                </button>
              </div>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                到期：{new Date(bindCode.expiresAt).toLocaleString()}
              </p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {bindCode.registerUrl}
              </p>
            </div>
          </>
        ) : (
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.75' }}>
            先生成绑定码，再让用户自己的 OpenClaw 技能远程注册这个槽位。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className={isAlpha ? "mk-button px-4 py-2" : "mk-button-gold px-4 py-2"}
            disabled={pendingSlot === slot}
            onClick={() => void generateBindCode(slot)}
            type="button"
          >
            {pendingSlot === slot
              ? "生成中..."
              : bindCode
                ? "重新生成绑定码"
                : "生成绑定码"}
          </button>
          <button
            className="mk-button-ghost px-4 py-2"
            onClick={() => void refreshOpenClawSlot(slot)}
            type="button"
          >
            刷新状态
          </button>
        </div>
      </div>
    );
  };

  const renderOverridePanel = (slot: "alpha" | "beta") => (
    <div className="mt-5 grid gap-3 rounded-[1.25rem] border border-[var(--line)] bg-white/75 p-4">
      <p className="text-sm font-semibold">对战覆盖</p>
      <input
        className="rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2 text-sm"
        onChange={(event) =>
          setOverrideDrafts((current) => ({
            ...current,
            [slot]: { ...current[slot], displayName: event.target.value },
          }))
        }
        placeholder="覆盖显示名"
        value={overrideDrafts[slot].displayName}
      />
      <textarea
        className="min-h-20 rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2 text-sm"
        onChange={(event) =>
          setOverrideDrafts((current) => ({
            ...current,
            [slot]: { ...current[slot], declaration: event.target.value },
          }))
        }
        placeholder="覆盖宣言"
        value={overrideDrafts[slot].declaration}
      />
      <textarea
        className="min-h-16 rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2 text-sm"
        onChange={(event) =>
          setOverrideDrafts((current) => ({
            ...current,
            [slot]: { ...current[slot], rule: event.target.value },
          }))
        }
        placeholder="覆盖规则"
        value={overrideDrafts[slot].rule}
      />
      <textarea
        className="min-h-16 rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2 text-sm"
        onChange={(event) =>
          setOverrideDrafts((current) => ({
            ...current,
            [slot]: { ...current[slot], taboo: event.target.value },
          }))
        }
        placeholder="覆盖禁忌"
        value={overrideDrafts[slot].taboo}
      />
      <textarea
        className="min-h-24 rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2 text-sm"
        onChange={(event) =>
          setOverrideDrafts((current) => ({
            ...current,
            [slot]: { ...current[slot], viewpoints: event.target.value },
          }))
        }
        placeholder="覆盖观点，每行一条"
        value={overrideDrafts[slot].viewpoints}
      />
      <input
        className="rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2 text-sm"
        onChange={(event) =>
          setOverrideDrafts((current) => ({
            ...current,
            [slot]: { ...current[slot], soulSeedTags: event.target.value },
          }))
        }
        placeholder="覆盖 Soul Seed 标签，逗号分隔"
        value={overrideDrafts[slot].soulSeedTags}
      />
    </div>
  );

  const renderParticipantCard = (
    slot: "alpha" | "beta",
    participant: ArenaParticipantSource | null,
    profile: ArenaCompetitorProfile | null,
  ) => (
    <article className="entry-fade paper-panel rounded-[1.75rem] p-6" key={slot}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">{participantTitle(slot)}</p>
          <h2 className="section-title mt-2">{participantSubtitle(participant)}</h2>
          <p className="mt-2 text-sm text-stone-600">
            来源：{participant?.provider ?? "未设置"}
            {participant?.sourceLabel ? ` · ${participant.sourceLabel}` : ""}
          </p>
          {profile ? (
            <p className="mt-1 text-sm text-stone-600">
              排名 {profile.rank ?? "-"} · 积分 {profile.rating} · 连胜 {profile.currentStreak}
            </p>
          ) : null}
          {participantRoute(participant) ? (
            <p className="mt-1 text-sm text-stone-600">路径：{participantRoute(participant)}</p>
          ) : null}
          {participantBio(participant) ? (
            <p className="mt-1 text-sm text-stone-600">{participantBio(participant)}</p>
          ) : null}
          {participantSourceKind(participant) ? (
            <p className="mt-1 text-sm text-stone-600">来源类型：{participantSourceKind(participant)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="soft-button rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm"
            onClick={() => void switchProvider(slot, "secondme")}
            type="button"
          >
            使用 SecondMe
          </button>
          <button
            className="soft-button rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm"
            onClick={() => void switchProvider(slot, "openclaw")}
            type="button"
          >
            使用 OpenClaw
          </button>
          {participant?.connected ? (
            <button
              className="soft-button rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white"
              onClick={() => void disconnectParticipant(slot)}
              type="button"
            >
              断开连接
            </button>
          ) : null}
        </div>
      </div>

      {renderOpenClawPanel(slot, participant)}
      {renderOverridePanel(slot)}
    </article>
  );

  return (
    <main className="scanlines relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10" style={{ color: 'var(--text)' }}>
      {/* Atmospheric arena art in the background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6">
        {/* ── HERO ── */}
        <section className="entry-fade mk-panel px-6 py-8 sm:px-10" style={{ overflow: 'hidden' }}>
          {/* Arena builder art peeking from right side */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/arena-builder-bg.png"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '50%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: 0.22,
              pointerEvents: 'none',
              maskImage: 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, transparent 100%)',
              zIndex: 0,
            }}
          />
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex flex-col gap-4">
              <div className="mk-badge">真实接入控制台</div>
              <h1 className="mk-title mk-title-anim">SecondMe 竞技台</h1>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.88rem', color: 'var(--text-dim)', lineHeight: '1.85', maxWidth: '56ch' }}>
                连接两位真实 SecondMe 参赛者，用他们的资料、标签和软记忆生成构筑，再把结果直接送进真实排位战。
              </p>
              {loadedSetup ? (
                <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  当前已载入重开模板，来源对局：{loadedSetup.originBattleId ?? "无"}。
                </p>
              ) : null}
            </div>

            <div className="mk-panel-gold p-5">
              <div className="mk-label-red mb-3">竞技态势</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '2.1' }}>
                <p>甲方：<span style={{ color: 'var(--red)' }}>{alpha?.connected ? participantSubtitle(alpha) : "未连接"}</span></p>
                <p>乙方：<span style={{ color: 'var(--gold)' }}>{beta?.connected ? participantSubtitle(beta) : "未连接"}</span></p>
                <p>当前辩题：{selectedTopic?.title ?? "载入中..."}</p>
                <p>编排模式：{orchestrationLabel(preview)}</p>
                <p>榜首：{featured ? `${featured.displayName} · ${featured.rating}` : "等待首战"}</p>
              </div>
              {matchupSummary ? (
                <div className="mk-status mt-3">
                  <p style={{ color: 'var(--gold)', fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.78rem' }}>
                    {matchupSummary.stakesLabel}
                  </p>
                  <p style={{ marginTop: '5px' }}>
                    若甲方胜出预计 <span style={{ color: 'var(--gold)' }}>+{matchupSummary.projectedWinDelta}</span>，
                    失利 <span style={{ color: 'var(--red)' }}>{matchupSummary.projectedLossDelta}</span>
                  </p>
                  <p style={{ marginTop: '4px', color: 'var(--text-muted)' }}>{matchupSummary.reason}</p>
                </div>
              ) : null}
              {duplicateWarning ? (
                <div className="mk-warning mt-3">
                  <p>{duplicateWarning}</p>
                  <p style={{ marginTop: '6px', fontSize: '0.78rem' }}>
                    如需真实双人，请让乙方使用隐身窗口或另一浏览器重新授权。
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mk-status mt-5">
            {status ?? "连接双方参赛者后，即可生成预览或开始排位对决。"}
          </div>
        </section>

        {/* ── FIGHTER SELECT: ALPHA vs BETA ── */}
        <section className="grid items-start gap-4 lg:grid-cols-[1fr_80px_1fr]">
          {/* Alpha */}
          <div className="slide-in-left">
            <FighterCard
              duplicateWarning={duplicateWarning}
              onConnect={() => connectParticipant("alpha")}
              onDisconnect={() => disconnectParticipant("alpha")}
              onOverrideChange={setAlphaOverride}
              opponentProfile={betaProfile}
              override={alphaOverride}
              participant={alpha}
              profile={alphaProfile}
              slot="alpha"
            />
          </div>

          {/* VS */}
          <div className="flex items-center justify-center self-center py-8">
            <div className="flex flex-col items-center gap-2">
              <div style={{ width: '1px', height: '40px', background: 'linear-gradient(180deg, transparent, var(--red))' }} />
              <span className="mk-vs">VS</span>
              <div style={{ width: '1px', height: '40px', background: 'linear-gradient(180deg, var(--gold-dim), transparent)' }} />
            </div>
          </div>

          {/* Beta */}
          <div className="slide-in-right">
            <FighterCard
              duplicateWarning={duplicateWarning}
              onConnect={() => connectParticipant("beta")}
              onDisconnect={() => disconnectParticipant("beta")}
              onOverrideChange={setBetaOverride}
              opponentProfile={alphaProfile}
              override={betaOverride}
              participant={beta}
              profile={betaProfile}
              slot="beta"
            />
          </div>
        </section>

        {/* ── TOPIC + BATTLE CONTROL ── */}
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Topic Selection */}
          <article className="entry-fade mk-panel p-6">
            <div className="mk-label-red mb-2">辩题选择</div>
            <h2 className="mk-section mb-5">选择本场排位辩题</h2>
            <div className="flex flex-col gap-3">
              {(() => {
                const zhihuTopics = meta?.topics.filter((t) => t.source === "zhihu_dynamic") ?? [];
                const presetTopics = meta?.topics.filter((t) => t.source !== "zhihu_dynamic") ?? [];
                return (
                  <>
                    {zhihuTopics.length > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                          <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', textShadow: '0 0 10px rgba(212,160,0,0.5)' }}>
                            知乎热榜
                          </span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-gold)' }} />
                          <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--gold-bright)', background: 'rgba(212,160,0,0.12)', border: '1px solid var(--border-gold)', borderRadius: '2px', padding: '2px 6px' }}>
                            实时
                          </span>
                        </div>
                        {zhihuTopics.map((topic, tidx) => (
                          <button
                            key={topic.id}
                            className={topic.id === topicId ? "mk-topic mk-topic-active" : "mk-topic"}
                            onClick={() => {
                              setTopicId(topic.id);
                              setTopicSnapshot(topic);
                            }}
                            style={{ border: topic.id === topicId ? '1px solid var(--gold-bright)' : '1px solid var(--border-gold)', boxShadow: topic.id === topicId ? '0 0 12px rgba(212,160,0,0.3)' : '0 0 6px rgba(212,160,0,0.1)', position: 'relative' }}
                            type="button"
                          >
                            {/* Number badge */}
                            <span style={{
                              position: 'absolute', top: '-10px', left: '-10px',
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: topic.id === topicId ? 'var(--gold)' : 'rgba(180,120,0,0.55)',
                              border: '2px solid rgba(255,215,0,0.6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'Impact, Arial Black, sans-serif',
                              fontSize: '0.72rem', color: '#1a0000', fontWeight: 'bold',
                              boxShadow: '0 0 8px rgba(212,160,0,0.5)',
                            }}>
                              {String(tidx + 1).padStart(2, '0')}
                            </span>
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                              <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.95rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: topic.id === topicId ? 'var(--gold-bright)' : 'var(--gold)' }}>
                                {topic.title}
                              </p>
                              <span className="mk-badge" style={{ fontSize: '0.55rem', borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                                知乎热榜
                              </span>
                              {topic.sourceMeta?.rankHint && (
                                <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.55rem', color: 'var(--red)', letterSpacing: '0.1em' }}>
                                  #{topic.sourceMeta.rankHint}
                                </span>
                              )}
                            </div>
                            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.7' }}>
                              {topic.prompt}
                            </p>
                          </button>
                        ))}
                      </>
                    )}
                    {presetTopics.length > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', marginTop: zhihuTopics.length > 0 ? '8px' : '0' }}>
                          <span style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            预设辩题
                          </span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                        </div>
                        {presetTopics.map((topic, tidx) => (
                          <button
                            key={topic.id}
                            className={topic.id === topicId ? "mk-topic mk-topic-active" : "mk-topic"}
                            onClick={() => {
                              setTopicId(topic.id);
                              setTopicSnapshot(topic);
                            }}
                            type="button"
                            style={{ position: 'relative' }}
                          >
                            {/* Number badge */}
                            <span style={{
                              position: 'absolute', top: '-10px', left: '-10px',
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: topic.id === topicId ? 'var(--red-bright)' : 'rgba(139,0,0,0.6)',
                              border: '2px solid rgba(200,0,0,0.6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'Impact, Arial Black, sans-serif',
                              fontSize: '0.72rem', color: '#fff', fontWeight: 'bold',
                              boxShadow: '0 0 8px rgba(200,0,0,0.5)',
                            }}>
                              {String(tidx + 1).padStart(2, '0')}
                            </span>
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                              <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.95rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: topic.id === topicId ? 'var(--red-bright)' : 'var(--text-bright)' }}>
                                {topic.title}
                              </p>
                              <span className="mk-badge" style={{ fontSize: '0.55rem' }}>
                                预设题
                              </span>
                            </div>
                            <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.7' }}>
                              {topic.prompt}
                            </p>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </article>

          {/* Battle Control */}
          <article className="entry-fade mk-panel p-6 flex flex-col gap-5">
            <div>
              <div className="mk-label-red mb-2">对战控制</div>
              <h2 className="mk-section">预览后直接进入排位</h2>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                className="mk-button-ghost px-4 py-3"
                onClick={() => void previewBuild()}
                type="button"
              >
                生成人格预览
              </button>
              <Link className="mk-button-ghost px-4 py-3" href="/arena/leaderboard">
                查看榜单
              </Link>
              <Link className="mk-button-ghost px-4 py-3" href="/arena/history">
                历史战报
              </Link>
              <Link
                className="mk-button-ghost px-4 py-3"
                href="/arena/watch"
                style={{ borderColor: 'var(--border-gold)', color: 'var(--gold)', fontSize: '0.82rem' }}
              >
                观众入场 →
              </Link>
            </div>

            {/* Big FIGHT button */}
            <button
              className="mk-button py-4 w-full"
              onClick={() => void startBattle()}
              type="button"
              style={{ fontSize: '1.2rem', letterSpacing: '0.3em' }}
            >
              ⚔ 开始排位对决
            </button>

            {matchupSummary ? (
              <div className="mk-panel-inset p-4">
                <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.8rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>
                  {matchupSummary.stakesLabel}
                </p>
                <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.8' }}>
                  这场若甲方胜出预计 <span style={{ color: 'var(--gold)' }}>+{matchupSummary.projectedWinDelta}</span>，
                  失利 <span style={{ color: 'var(--red)' }}>{matchupSummary.projectedLossDelta}</span>。
                </p>
                <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                  {matchupSummary.reason}
                </p>
              </div>
            ) : null}

            {duplicateWarning ? (
              <div className="mk-warning">
                <p>{duplicateWarning}</p>
                <p style={{ marginTop: '6px' }}>
                  当前允许继续预览和开战，方便单人演示；如果要真实双人，请重新授权乙方。
                </p>
              </div>
            ) : null}

            {/* Leaderboard preview */}
            <div className="mk-panel-inset p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.78rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--red)' }}>
                  榜单速览
                </p>
                {featured ? (
                  <span className="mk-badge-gold">{featured.displayName}</span>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                {leaderboard.length ? (
                  leaderboard.map((entry) => (
                    <div key={entry.competitorId} className="mk-rank-row" style={{ padding: '8px 12px' }}>
                      <div className="flex items-center gap-3">
                        <span className="mk-rank-number" style={{ fontSize: '1.1rem' }}>#{entry.rank}</span>
                        <div>
                          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-bright)' }}>
                            {entry.displayName}
                          </p>
                          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            积分 {entry.rating} · 连胜 {entry.currentStreak}
                          </p>
                        </div>
                      </div>
                      <span className="mk-badge">{entry.wins}W {entry.losses}L</span>
                    </div>
                  ))
                ) : (
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    还没有排位榜单，首场对局保存后就会出现。
                  </p>
                )}
              </div>
            </div>

            {/* Build Preview */}
            {preview ? (
              <div className="flex flex-col gap-4">
                <div className="mk-panel-inset p-4">
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-bright)', marginBottom: '6px' }}>
                    {preview.player.displayName} <span style={{ color: 'var(--red)' }}>vs</span> {preview.defender.displayName}
                  </p>
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.75', marginBottom: '10px' }}>
                    {preview.matchUpCallout}
                  </p>
                  {preview.sourceMeta.issues.length ? (
                    <div className="mk-warning">
                      {preview.sourceMeta.issues.map((issue) => (
                        <p key={issue}>{issue}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2 mt-3">
                    <div className="mk-panel-inset p-3">
                      <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: '8px' }}>
                        赛前优势判断
                      </p>
                      <div className="flex flex-col gap-1">
                        {preview.predictedEdges.map((edge) => (
                          <p key={edge} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: '1.6' }}>{edge}</p>
                        ))}
                      </div>
                    </div>
                    <div className="mk-panel-inset p-3">
                      <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>
                        构筑提示
                      </p>
                      <div className="flex flex-col gap-1">
                        {preview.equipmentNotes.map((note) => (
                          <p key={note} style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: '1.6' }}>{note}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {[preview.player, preview.defender].map((fighter, idx) => {
                  const isPlayer = idx === 0;
                  const participant = isPlayer ? alpha : beta;
                  return (
                    <article key={fighter.id} className={isPlayer ? "mk-fighter-card p-4" : "mk-fighter-card-gold p-4"}>
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                          <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: isPlayer ? 'var(--red-bright)' : 'var(--gold-bright)' }}>
                            {fighter.displayName}
                          </p>
                          <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {fighter.powerLabel}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={isPlayer ? "mk-badge" : "mk-badge-gold"}>{fighter.source.provider}</span>
                          <span className={isPlayer ? "mk-badge" : "mk-badge-gold"}>{fighter.source.slot === "alpha" ? "甲方" : "乙方"}</span>
                        </div>
                      </div>

                      {/* Declaration */}
                      <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.7', marginBottom: '12px', borderLeft: `3px solid ${isPlayer ? 'var(--red-dark)' : 'var(--gold-dim)'}`, paddingLeft: '10px' }}>
                        {fighter.declaration}
                      </p>

                      {/* Build derivation: cards + soul + trace */}
                      <BuildDerivationPanel fighter={fighter} participant={participant} isPlayer={isPlayer} />
                    </article>
                  );
                })}
              </div>
            ) : null}
          </article>
        </section>

        {/* ── SIGNALS ── */}
        <section className="entry-fade mk-panel p-6">
          <div className="mk-label-red mb-2">外部信号</div>
          <h2 className="mk-section mb-5">知乎灵感信号</h2>
          <div className="flex flex-wrap gap-3">
            {meta?.signals?.length ? (
              meta.signals.map((signal) => (
                <span key={signal} className="mk-badge">
                  {signal}
                </span>
              ))
            ) : (
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                当前没有可用外部信号。
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
