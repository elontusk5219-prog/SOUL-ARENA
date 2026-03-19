"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  ArenaLeaderboardEntry,
  BattleSummary,
} from "@/lib/arena-types";

type BattleFilter = "all" | "loss" | "win";

const filters: Array<{ id: BattleFilter; label: string; emoji: string }> = [
  { id: "all", label: "全部", emoji: "⚔️" },
  { id: "win", label: "胜利", emoji: "🏆" },
  { id: "loss", label: "失败", emoji: "💀" },
];

function CopyLinkButton({ battleId }: { battleId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}/arena/${battleId}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className="mk-button-ghost px-4 py-2"
      onClick={handleCopy}
      style={{ fontSize: "0.75rem" }}
      type="button"
    >
      {copied ? "已复制 ✓" : "复制链接"}
    </button>
  );
}

const winnerLabel = (
  winnerId: string,
  playerName: string,
  defenderName: string,
) =>
  winnerId === "player"
    ? playerName
    : winnerId === "defender"
      ? defenderName
      : winnerId;

function BattleFightCard({ battle }: { battle: BattleSummary }) {
  const result = battle.competition?.player?.result;
  const isWin = result === "win";
  const isLoss = result === "loss";
  const winner = winnerLabel(battle.winnerId, battle.playerDisplayName, battle.defenderDisplayName);
  const playerIsWinner = battle.winnerId === "player";
  const defenderIsWinner = battle.winnerId === "defender";

  return (
    <article style={{
      background: "rgba(0,0,0,0.7)",
      border: "1px solid rgba(120,0,0,0.3)",
      borderTop: isWin ? "2px solid var(--gold-bright)" : isLoss ? "2px solid var(--red-bright)" : "2px solid var(--red)",
      position: "relative",
      overflow: "hidden",
      transition: "all 200ms ease",
    }}>
      {/* CHAMPION RECORDED stamp — only for wins */}
      {isWin && (
        <div style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          fontFamily: "Impact, Arial Black, sans-serif",
          fontSize: "0.55rem",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--gold-bright)",
          border: "2px solid var(--gold-bright)",
          padding: "3px 8px",
          opacity: 0.7,
          transform: "rotate(3deg)",
          boxShadow: "0 0 8px rgba(255,215,0,0.3)",
          pointerEvents: "none",
        }}>
          CHAMPION RECORDED
        </div>
      )}

      {/* Battle-history decorative icon */}
      <div style={{
        position: "absolute",
        bottom: "-10px",
        left: "-10px",
        width: "80px",
        height: "80px",
        opacity: 0.06,
        backgroundImage: "url('/battle-history-icon.png')",
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        pointerEvents: "none",
      }} />

      {/* Header row */}
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(80,0,0,0.3)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mk-badge">
            {battle.generationMode === "mock" ? "经典演示" : "真实排位"}
          </div>
          {battle.topicTitle && (
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: "0.68rem", color: "var(--text-muted)" }}>
              辩题：{battle.topicTitle}
            </span>
          )}
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: "auto" }}>
            {new Date(battle.createdAt).toLocaleString()}
          </span>
        </div>
        <h3 style={{
          fontFamily: "Impact, Arial Black, sans-serif",
          fontSize: "0.95rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-bright)",
          marginTop: "6px",
        }}>
          {battle.roomTitle}
        </h3>
      </div>

      {/* VS fighter row */}
      <div style={{ padding: "16px" }}>
        <div className="flex items-center gap-3">
          {/* Player side */}
          <div style={{
            flex: 1,
            background: playerIsWinner
              ? "linear-gradient(135deg, rgba(40,28,0,0.6) 0%, rgba(0,0,0,0.4) 100%)"
              : "rgba(0,0,0,0.4)",
            border: playerIsWinner ? "1px solid var(--gold-bright)" : "1px solid rgba(60,0,0,0.3)",
            borderRadius: "2px",
            padding: "12px",
            textAlign: "center",
            boxShadow: playerIsWinner ? "0 0 16px rgba(255,215,0,0.25)" : undefined,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "conic-gradient(var(--red-dark) 0deg, var(--red-bright) 180deg, var(--red-dark) 360deg)",
              border: playerIsWinner ? "2px solid var(--gold-bright)" : "1px solid rgba(120,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 8px",
              boxShadow: playerIsWinner ? "0 0 14px rgba(255,215,0,0.4)" : undefined,
            }}>
              <span style={{ fontFamily: "Impact", fontSize: "1.2rem", color: "var(--text-bright)" }}>
                {battle.playerDisplayName.charAt(0)}
              </span>
            </div>
            <p style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: playerIsWinner ? "var(--gold-bright)" : "var(--text-bright)",
              textShadow: playerIsWinner ? "0 0 10px rgba(255,215,0,0.5)" : undefined,
            }}>
              {battle.playerDisplayName}
            </p>
            {playerIsWinner && (
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.6rem", color: "var(--gold)", marginTop: "3px" }}>WINNER</p>
            )}
          </div>

          {/* VS */}
          <div style={{
            fontFamily: "Impact, Arial Black, sans-serif",
            fontSize: "1.4rem",
            color: "var(--red-bright)",
            textShadow: "0 0 16px rgba(255,30,0,0.7)",
            letterSpacing: "0.1em",
            flexShrink: 0,
            padding: "0 4px",
          }}>
            VS
          </div>

          {/* Defender side */}
          <div style={{
            flex: 1,
            background: defenderIsWinner
              ? "linear-gradient(135deg, rgba(40,28,0,0.6) 0%, rgba(0,0,0,0.4) 100%)"
              : "rgba(0,0,0,0.4)",
            border: defenderIsWinner ? "1px solid var(--gold-bright)" : "1px solid rgba(60,0,0,0.3)",
            borderRadius: "2px",
            padding: "12px",
            textAlign: "center",
            boxShadow: defenderIsWinner ? "0 0 16px rgba(255,215,0,0.25)" : undefined,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "conic-gradient(#00008b 0deg, #0000cd 180deg, #00008b 360deg)",
              border: defenderIsWinner ? "2px solid var(--gold-bright)" : "1px solid rgba(0,0,120,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 8px",
              boxShadow: defenderIsWinner ? "0 0 14px rgba(255,215,0,0.4)" : undefined,
            }}>
              <span style={{ fontFamily: "Impact", fontSize: "1.2rem", color: "var(--text-bright)" }}>
                {battle.defenderDisplayName.charAt(0)}
              </span>
            </div>
            <p style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: defenderIsWinner ? "var(--gold-bright)" : "var(--text-bright)",
              textShadow: defenderIsWinner ? "0 0 10px rgba(255,215,0,0.5)" : undefined,
            }}>
              {battle.defenderDisplayName}
            </p>
            {defenderIsWinner && (
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.6rem", color: "var(--gold)", marginTop: "3px" }}>WINNER</p>
            )}
          </div>
        </div>

        {/* Winner label */}
        <div style={{
          textAlign: "center",
          marginTop: "10px",
          fontFamily: "'Courier New', monospace",
          fontSize: "0.72rem",
          color: "var(--gold)",
        }}>
          胜者：<span style={{ color: "var(--gold-bright)", fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.85rem", letterSpacing: "0.06em" }}>{winner}</span>
        </div>

        {/* Competition stats */}
        {battle.competition?.player && (
          <div style={{
            marginTop: "10px",
            padding: "8px 12px",
            background: "rgba(0,0,0,0.5)",
            border: "1px solid rgba(60,0,0,0.3)",
            borderLeft: `3px solid ${isWin ? "var(--gold)" : "var(--red)"}`,
          }}>
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.72rem", color: "var(--text-dim)" }}>
              {battle.competition.stakesLabel} · 挑战者积分{" "}
              <span style={{ color: battle.competition.player.scoreDelta > 0 ? "var(--gold)" : "var(--red)" }}>
                {battle.competition.player.scoreDelta > 0 ? "+" : ""}{battle.competition.player.scoreDelta}
              </span>
              {" · "}排名 {battle.competition.player.rankBefore ?? "-"} → {battle.competition.player.rankAfter ?? "-"}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          {battle.competition?.player && (
            <span className={isWin ? "mk-badge-gold" : "mk-badge"} style={{ fontSize: "0.58rem" }}>
              {isWin ? "🏆 胜利" : "💀 失败"}
            </span>
          )}
          <Link className="mk-button-ghost px-4 py-2" href={`/arena/${battle.id}`} style={{ fontSize: "0.72rem", marginLeft: "auto" }}>
            打开回放
          </Link>
          {battle.setupId && (
            <Link className="mk-button-ghost px-4 py-2" href={`/arena?setupId=${battle.setupId}`} style={{ fontSize: "0.72rem" }}>
              继续重开
            </Link>
          )}
          <CopyLinkButton battleId={battle.id} />
        </div>
      </div>
    </article>
  );
}

export function ArenaHistoryBoard({
  battles,
  featured,
}: {
  battles: BattleSummary[];
  featured: ArenaLeaderboardEntry | null;
}) {
  const [filter, setFilter] = useState<BattleFilter>("all");

  const competitiveBattles = useMemo(
    () =>
      battles.filter(
        (battle) =>
          battle.generationMode === "orchestrated" && battle.competition?.player,
      ),
    [battles],
  );
  const playerWins = competitiveBattles.filter(
    (battle) => battle.competition?.player?.result === "win",
  ).length;
  const playerLosses = competitiveBattles.filter(
    (battle) => battle.competition?.player?.result === "loss",
  ).length;
  const upsetWins = competitiveBattles.filter(
    (battle) =>
      battle.competition?.isUpsetWin &&
      battle.competition.player?.result === "win",
  ).length;
  const filteredBattles = battles.filter((battle) => {
    if (filter === "all") return true;
    if (!battle.competition?.player) return false;
    return battle.competition.player.result === filter;
  });

  return (
    <section className="entry-fade mk-panel p-6">
      {/* Battle history icon decoration */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        marginBottom: "20px",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/battle-history-icon.png"
          alt=""
          aria-hidden="true"
          style={{ width: 56, height: 56, objectFit: "contain", opacity: 0.75, flexShrink: 0 }}
        />
        <div>
          <div className="mk-label-red mb-1">战绩档案</div>
          <h2 className="mk-section" style={{ paddingBottom: "4px" }}>每场对局都刻入石碑</h2>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
        <article className="mk-panel-inset p-4">
          <div className="mk-label mb-3">排位总场次</div>
          <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "2.5rem", color: "var(--red)", textShadow: "0 0 12px rgba(200,0,0,0.5)", lineHeight: 1, marginBottom: "8px" }}>
            {competitiveBattles.length}
          </p>
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {playerWins} 胜 {playerLosses} 负
          </p>
        </article>

        <article className="mk-panel-inset p-4">
          <div className="mk-label mb-3">当前榜首</div>
          <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "1.1rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gold-bright)", lineHeight: 1.2, marginBottom: "8px" }}>
            {featured ? featured.displayName : "尚未开赛"}
          </p>
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {featured
              ? `积分 ${featured.rating} · 连胜 ${featured.currentStreak}`
              : "等待第一场真实对局"}
          </p>
        </article>

        <article className="mk-panel-inset p-4">
          <div className="mk-label mb-3">下克上</div>
          <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "2.5rem", color: "var(--gold)", textShadow: "0 0 12px rgba(212,160,0,0.4)", lineHeight: 1, marginBottom: "8px" }}>
            {upsetWins}
          </p>
          <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            越级冲榜成功局数
          </p>
        </article>

        <article className="mk-panel-inset p-4">
          <div className="mk-label mb-3">列表筛选</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {filters.map((item) => (
              <button
                key={item.id}
                className={item.id === filter ? "mk-button px-3 py-2" : "mk-button-ghost px-3 py-2"}
                onClick={() => setFilter(item.id)}
                style={{ fontSize: "0.72rem", letterSpacing: "0.12em" }}
                type="button"
              >
                {item.emoji} {item.label}
              </button>
            ))}
          </div>
        </article>
      </div>

      <hr className="mk-divider mb-6" />

      {/* Battle fight cards grid */}
      {filteredBattles.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredBattles.map((battle) => (
            <BattleFightCard key={battle.id} battle={battle} />
          ))}
        </div>
      ) : (
        <div className="mk-status">当前筛选条件下还没有匹配战报。</div>
      )}
    </section>
  );
}
