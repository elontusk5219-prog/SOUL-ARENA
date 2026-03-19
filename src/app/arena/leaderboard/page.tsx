"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

// Types matching what /api/arena/leaderboard returns
interface LeaderboardSuggestion {
  competitorId: string;
  displayName: string;
  projectedWinDelta: number;
  projectedLossDelta: number;
}

interface LeaderboardEntry {
  competitorId: string;
  displayName: string;
  rank: number | null;
  rating: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  lastResult: "win" | "loss" | null;
  recentForm: string[];
  suggestion: LeaderboardSuggestion | null;
}

interface FeaturedCompetitor {
  competitorId: string;
  displayName: string;
  rank: number | null;
  rating: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  suggestion: LeaderboardSuggestion | null;
}

interface LeaderboardApiResponse {
  leaderboard: LeaderboardEntry[];
  featured: FeaturedCompetitor | null;
}

const resultLabel = (result: "win" | "loss" | null) => {
  if (result === "win") return "上一场获胜";
  if (result === "loss") return "上一场失利";
  return "尚未开赛";
};

const rankBadgeImg = (rank: number) => {
  if (rank === 1) return "/rank-badge-1.png";
  if (rank === 2) return "/rank-badge-2.png";
  if (rank === 3) return "/rank-badge-3.png";
  return null;
};

const rankColors: Record<number, { name: string; glow: string; border: string }> = {
  1: { name: "var(--gold-bright)", glow: "0 0 24px rgba(255,215,0,0.55)", border: "2px solid var(--gold-bright)" },
  2: { name: "#c0d0e0",           glow: "0 0 18px rgba(180,210,240,0.4)", border: "2px solid #8ab0d0" },
  3: { name: "#d4804a",           glow: "0 0 18px rgba(200,120,60,0.4)",  border: "2px solid #c07040" },
};

function AnimatedScore({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    let start: number | null = null;
    const duration = 1200;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);

  return <>{display}</>;
}

function ScoreBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 100);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(60,0,0,0.35)", height: "6px", borderRadius: "1px", overflow: "hidden", width: "100%" }}>
      <div
        className="score-bar-animate"
        style={{
          height: "100%",
          width: `${width}%`,
          background: color,
          boxShadow: `0 0 6px ${color}`,
          transition: "width 1.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </div>
  );
}

function LeaderboardRow({ entry, maxRating }: { entry: LeaderboardEntry; maxRating: number }) {
  const rank = entry.rank ?? 999;
  const badge = rankBadgeImg(rank);
  const rc = rankColors[rank];
  const isTop3 = rank <= 3;
  const scorePct = maxRating > 0 ? Math.min((entry.rating / maxRating) * 100, 100) : 0;
  const winPct = entry.wins + entry.losses > 0 ? (entry.wins / (entry.wins + entry.losses)) * 100 : 0;

  return (
    <article
      style={{
        background: isTop3
          ? `linear-gradient(135deg, rgba(${rank === 1 ? "40,28,0" : rank === 2 ? "15,25,40" : "35,18,5"},0.9) 0%, rgba(0,0,0,0.85) 100%)`
          : rank % 2 === 0
            ? "rgba(30,0,15,0.55)"
            : "rgba(0,0,0,0.55)",
        border: isTop3 ? (rc?.border ?? "1px solid rgba(120,0,0,0.3)") : "1px solid rgba(80,0,0,0.25)",
        borderLeft: `4px solid ${rc?.name ?? "var(--red-dark)"}`,
        boxShadow: isTop3 ? rc?.glow : undefined,
        padding: "16px 20px",
        position: "relative",
        transition: "all 200ms ease",
      }}
    >
      {/* Gold separator line */}
      {isTop3 && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: `linear-gradient(90deg, transparent, ${rc?.name ?? "var(--gold)"}, transparent)`,
          opacity: 0.5,
        }} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: badge + name + stats */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Rank badge or number */}
          {badge ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={badge} alt={`Rank ${rank}`} style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0 }} />
          ) : (
            <span style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "1.8rem",
              lineHeight: 1,
              color: "var(--red)",
              textShadow: "0 0 10px rgba(200,0,0,0.4)",
              minWidth: "3rem",
              textAlign: "center",
              flexShrink: 0,
            }}>
              #{rank}
            </span>
          )}

          {/* Avatar circle */}
          <div style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: `conic-gradient(var(--red-dark) 0deg, var(--red-bright) 120deg, var(--red-dark) 240deg, var(--gold-dim) 360deg)`,
            border: `2px solid ${rc?.name ?? "rgba(120,0,0,0.5)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isTop3 ? `0 0 12px ${rc?.name ?? "transparent"}` : undefined,
          }}>
            <span style={{
              fontFamily: "Impact, Arial Black, sans-serif",
              fontSize: "1.1rem",
              color: "var(--text-bright)",
              textTransform: "uppercase",
              letterSpacing: 0,
            }}>
              {entry.displayName.charAt(0)}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Name row */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p style={{
                fontFamily: "Impact, Arial Black, sans-serif",
                fontSize: "1.08rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: rc?.name ?? "var(--text-bright)",
                textShadow: isTop3 ? `0 0 12px ${rc?.name}` : undefined,
              }}>
                {entry.displayName}
              </p>
              {entry.currentStreak >= 3 && (
                <span style={{
                  fontFamily: "Impact, Arial Black, sans-serif",
                  fontSize: "0.65rem",
                  letterSpacing: "0.2em",
                  background: "rgba(200,60,0,0.25)",
                  border: "1px solid var(--ember)",
                  color: "#ff8800",
                  padding: "2px 8px",
                  textShadow: "0 0 8px rgba(255,120,0,0.6)",
                }}>
                  🔥 连胜 {entry.currentStreak}
                </span>
              )}
              {rank === 1 && (
                <span style={{
                  fontFamily: "Impact, Arial Black, sans-serif",
                  fontSize: "0.6rem",
                  letterSpacing: "0.3em",
                  background: "rgba(180,120,0,0.3)",
                  border: "1px solid var(--gold-bright)",
                  color: "var(--gold-bright)",
                  padding: "2px 10px",
                }}>
                  CHAMPION
                </span>
              )}
            </div>

            {/* Score bar */}
            <div className="mb-1">
              <ScoreBar
                pct={scorePct}
                color={rc ? rc.name : "var(--red)"}
              />
            </div>

            <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.75rem", color: "var(--text-dim)", lineHeight: "1.7" }}>
              积分 <span style={{ color: rc?.name ?? "var(--gold)" }}><AnimatedScore target={entry.rating} /></span>
              {" · "}{entry.wins}胜 {entry.losses}负 · 胜率 {entry.winRate}%
            </p>
            <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: "1.6" }}>
              最高连胜 {entry.bestStreak} · {resultLabel(entry.lastResult)}
            </p>
          </div>
        </div>

        {/* Right: win bar + badge + suggestion */}
        <div className="flex flex-col items-end gap-2 shrink-0" style={{ minWidth: "140px" }}>
          <span className="mk-badge-gold" style={{ fontSize: "0.6rem" }}>
            近况 {entry.recentForm.join(" ") || "暂无"}
          </span>

          {/* Win rate bar */}
          <div style={{ width: "120px" }}>
            <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.55rem", letterSpacing: "0.25em", color: "var(--text-muted)", marginBottom: "3px" }}>WINRATE</p>
            <ScoreBar pct={winPct} color="var(--gold)" />
          </div>

          {entry.suggestion && (
            <div style={{
              background: "rgba(0,0,0,0.7)",
              border: "1px solid rgba(80,0,0,0.4)",
              borderLeft: "2px solid var(--red)",
              padding: "6px 10px",
              minWidth: "140px",
            }}>
              <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.55rem", letterSpacing: "0.2em", color: "var(--red)", marginBottom: "4px", textTransform: "uppercase" }}>
                建议挑战
              </p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                {entry.suggestion.displayName}
              </p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.65rem", color: "var(--text-muted)" }}>
                胜 <span style={{ color: "var(--gold)" }}>+{entry.suggestion.projectedWinDelta}</span> / 负 <span style={{ color: "var(--red)" }}>{entry.suggestion.projectedLossDelta}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ArenaLeaderboardPage() {
  const [data, setData] = useState<LeaderboardApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/arena/leaderboard?limit=20")
      .then((res) => res.json())
      .then((json: LeaderboardApiResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const leaderboard = data?.leaderboard ?? [];
  const featured = data?.featured ?? null;
  const maxRating = leaderboard[0]?.rating ?? 1;

  return (
    <main
      className="scanlines page-content relative min-h-screen overflow-hidden"
      style={{
        color: "var(--text)",
        backgroundImage: `
          url('/leaderboard-bg.png'),
          radial-gradient(ellipse at 50% -10%, rgba(139,0,0,0.4) 0%, transparent 55%),
          linear-gradient(180deg, #060008 0%, #0a0010 60%, #050007 100%)
        `,
        backgroundSize: "cover, auto, auto",
        backgroundPosition: "center top, center, center",
        backgroundBlendMode: "overlay, normal, normal",
      }}
    >
      {/* Dark overlay so content stays readable */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,0,8,0.78)", pointerEvents: "none" }} aria-hidden="true" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">

        {/* ── CHAMPION BANNER ── */}
        {featured && (
          <section className="entry-fade" style={{
            background: "linear-gradient(135deg, rgba(40,28,0,0.95) 0%, rgba(8,0,5,0.97) 60%, rgba(20,10,0,0.95) 100%)",
            border: "1px solid var(--gold-bright)",
            borderTop: "3px solid var(--gold-bright)",
            padding: "20px 28px",
            position: "relative",
            boxShadow: "0 0 40px rgba(255,215,0,0.25), inset 0 0 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "1px",
              background: "linear-gradient(90deg, transparent, var(--gold-bright), transparent)",
            }} />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/rank-badge-1.png" alt="Champion" style={{ width: 72, height: 72, objectFit: "contain" }} />
                <div>
                  <p style={{
                    fontFamily: "Impact, Arial Black, sans-serif",
                    fontSize: "0.65rem", letterSpacing: "0.5em",
                    color: "var(--gold)", textTransform: "uppercase", marginBottom: "4px",
                  }}>
                    CHAMPION · CURRENT LEADER
                  </p>
                  <p style={{
                    fontFamily: "Impact, Arial Black, sans-serif",
                    fontSize: "clamp(1.6rem, 4vw, 2.8rem)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--gold-bright)",
                    textShadow: "0 0 24px rgba(255,215,0,0.6), 3px 3px 0 #5a3800",
                    lineHeight: 1,
                  }}>
                    {featured.displayName}
                  </p>
                </div>
              </div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: "1.9", textAlign: "right" }}>
                <p>积分 <span style={{ color: "var(--gold-bright)", fontSize: "1.3rem", fontFamily: "Impact, Arial Black, sans-serif" }}>{featured.rating}</span></p>
                <p>{featured.wins}胜 {featured.losses}负 · 胜率 <span style={{ color: "var(--red)" }}>{featured.winRate}%</span></p>
                <p>当前连胜 <span style={{ color: "var(--gold)" }}>{featured.currentStreak}</span> · 最高 {featured.bestStreak}</p>
              </div>
            </div>
          </section>
        )}

        {/* ── HERO HEADER ── */}
        <section className="entry-fade mk-panel px-6 py-8 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="mk-badge">Arena Leaderboard</div>
              <h1 className="mk-title mk-title-anim">竞技排行榜</h1>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: "1.85", maxWidth: "52ch" }}>
                用积分、连胜和最近状态来定义当前竞技场的统治力。每一场真实 battle 都会直接改变这里的顺位。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="mk-button px-5 py-3" href="/arena">进入竞技场</Link>
              <Link className="mk-button-ghost px-5 py-3" href="/arena/history">查看战绩中心</Link>
            </div>
          </div>
        </section>

        {/* ── RULES ── */}
        <section className="entry-fade mk-panel p-6">
          <div className="mk-label-red mb-2">排名规则</div>
          <div className="grid gap-3 md:grid-cols-3 mt-4">
            <div className="mk-panel-inset p-4">
              <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", color: "var(--red)", marginBottom: "6px", textTransform: "uppercase" }}>01 积分优先</p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: "1.75" }}>
                积分优先，积分相同时按当前连胜排序。
              </p>
            </div>
            <div className="mk-panel-inset p-4">
              <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", color: "var(--red)", marginBottom: "6px", textTransform: "uppercase" }}>02 胜率加权</p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: "1.75" }}>
                再看胜率与最近状态，避免纯场次刷榜。
              </p>
            </div>
            <div className="mk-panel-inset p-4">
              <p style={{ fontFamily: "Impact, Arial Black, sans-serif", fontSize: "0.62rem", letterSpacing: "0.3em", color: "var(--red)", marginBottom: "6px", textTransform: "uppercase" }}>03 越级激励</p>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: "1.75" }}>
                击败高分对手获更高收益，失利风险同等放大。
              </p>
            </div>
          </div>
        </section>

        {/* ── FULL LEADERBOARD ── */}
        <section className="entry-fade mk-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <div className="mk-label-red mb-2">排行榜</div>
              <h2 className="mk-section">
                {loading
                  ? "加载中..."
                  : leaderboard.length
                    ? `共 ${leaderboard.length} 位上榜选手`
                    : "尚未形成榜单"}
              </h2>
            </div>
          </div>

          {/* Gold separator */}
          <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, var(--gold-dim), transparent)", marginBottom: "20px" }} />

          {loading ? (
            <div className="mk-status">正在加载排行榜数据…</div>
          ) : leaderboard.length ? (
            <div className="flex flex-col gap-3">
              {leaderboard.map((entry) => (
                <LeaderboardRow key={entry.competitorId} entry={entry} maxRating={maxRating} />
              ))}
            </div>
          ) : (
            <div className="mk-status">
              还没有真实排位战数据，排行榜会在第一场真实对局保存后自动出现。
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
