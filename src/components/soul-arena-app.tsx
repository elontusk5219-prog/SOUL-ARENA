import Link from "next/link";

import {
  getArenaFeaturedCompetitor,
  getArenaLeaderboard,
  listArenaBattleSummariesWithCompetition,
} from "@/lib/arena-competition";
import { getClassicBattlePackages } from "@/lib/arena";
import { soulLabels } from "@/lib/arena-presets";
import { BattleTicker } from "@/components/battle-ticker";

const steps = [
  {
    body: "先连接双方人格与记忆，再把这些输入整理成可对战的构筑。",
    title: "连接人格",
  },
  {
    body: "系统会把身份、观点、规则和禁忌映射成可解释的战斗能力。",
    title: "生成战斗包",
  },
  {
    body: "排位回放会给出胜负、积分变化、连胜变化和下一战动机。",
    title: "回放冲榜",
  },
];

const gameGoals = [
  {
    body: "通过连胜和越级挑战冲上排行榜前列。",
    title: "冲榜",
    icon: "🏆",
  },
  {
    body: "狙击正在连胜的强者，拿下最值钱的一分。",
    title: "断连胜",
    icon: "⚔️",
  },
  {
    body: "打完一场立刻看到下一位值得挑战的目标。",
    title: "继续开战",
    icon: "🔥",
  },
];

const classicCaseCopy = [
  {
    note: "适合快速理解 Soul Arena 的节奏、分数和高光结构。",
    title: "经典演示",
  },
  {
    note: "用于说明回放结构，不计入真实排行榜。",
    title: "回放样本",
  },
  {
    note: "展示解释型 battle 的镜头语言和对抗逻辑。",
    title: "玩法预告",
  },
];

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

export function SoulArenaApp() {
  const classics = getClassicBattlePackages();
  const leaderboard = getArenaLeaderboard(5);
  const featured = getArenaFeaturedCompetitor();
  const recentBattles = listArenaBattleSummariesWithCompetition(3);

  return (
    <>
    <BattleTicker />
    <main className="scanlines relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10" style={{ color: 'var(--text)' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">

        {/* ── HERO ── */}
        <section className="entry-fade hero-particles mk-panel px-8 py-10 sm:px-12" style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Soul Arena title art — wide atmospheric background */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/soul-arena-title.png"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '55%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center top',
              opacity: 0.18,
              pointerEvents: 'none',
              maskImage: 'linear-gradient(to left, rgba(0,0,0,0.7) 0%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.7) 0%, transparent 100%)',
              zIndex: 0,
            }}
          />
          {/* Arena logo watermark */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/arena-logo.png"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '-20px',
              top: '-20px',
              width: '280px',
              height: '280px',
              opacity: 0.06,
              pointerEvents: 'none',
              filter: 'saturate(0) brightness(2)',
              zIndex: 0,
            }}
          />
          <div className="grid gap-10 lg:grid-cols-[1.3fr_0.85fr]" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex flex-col gap-5">
              <div className="mk-badge">Agent 构筑竞技场</div>
              <h1
                className="mk-title mk-title-anim"
                style={{
                  textShadow: '6px 6px 0 #4a0000, 0 0 40px rgba(255,30,0,0.7), 0 0 90px rgba(200,0,0,0.45), 0 0 140px rgba(139,0,0,0.2)',
                }}
              >
                Soul Arena
              </h1>
              <p style={{ fontFamily: "'Courier New', monospace", color: 'var(--text-dim)', lineHeight: '1.85', fontSize: '0.9rem', maxWidth: '56ch' }}>
                这里不只是看 AI 输出，而是把人格、观点、规则、禁忌与记忆全部转成可对战的构筑，
                再用一场可回放、可录屏、可冲榜的 battle 来验证谁的构筑更强。
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link className="mk-button press-start px-6 py-3" href="/arena">进入竞技场</Link>
                <Link className="mk-button-ghost px-5 py-3" href="/arena/leaderboard">查看排行榜</Link>
                <Link className="mk-button-ghost px-5 py-3" href="/arena/history">查看战绩中心</Link>
                <Link className="mk-button-ghost px-5 py-3" href="/arena/watch">观战入场</Link>
              </div>
            </div>

            <div className="mk-panel-gold p-6">
              <div className="mk-label-red mb-4">当前竞技焦点</div>
              {featured ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold-bright)', textShadow: '0 0 15px rgba(255,215,0,0.4)' }}>
                      {featured.displayName}
                    </p>
                    <p style={{ color: 'var(--red)', fontFamily: 'Impact, sans-serif', fontSize: '0.7rem', letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: '2px' }}>
                      正在领跑
                    </p>
                  </div>
                  <hr className="mk-divider" />
                  <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '2' }}>
                    <p>第 {featured.rank} 名 · 积分 <span style={{ color: 'var(--gold)' }}>{featured.rating}</span></p>
                    <p>{featured.wins} 胜 {featured.losses} 负 · 胜率 <span style={{ color: 'var(--red)' }}>{featured.winRate}%</span></p>
                    <p>当前连胜 <span style={{ color: 'var(--gold-bright)' }}>{featured.currentStreak}</span> · 最高连胜 {featured.bestStreak}</p>
                  </div>
                  {featured.suggestion ? (
                    <div className="mk-status">
                      <p style={{ color: 'var(--gold)', fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                        下一位建议挑战：{featured.suggestion.displayName}
                      </p>
                      <p style={{ marginTop: '6px' }}>
                        胜出预计 <span style={{ color: 'var(--gold)' }}>+{featured.suggestion.projectedWinDelta}</span>，
                        失利 <span style={{ color: 'var(--red)' }}>{featured.suggestion.projectedLossDelta}</span>
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '1.9' }}>
                  <p>竞技场已经具备真实排位机制，但榜单还在等待第一场 battle。</p>
                  <p style={{ marginTop: '8px' }}>连接两位 SecondMe 参赛者后，积分、连胜与下一战推荐就会自动开始滚动。</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── GAME GOALS ── */}
        <section className="grid gap-4 lg:grid-cols-3">
          {gameGoals.map((goal, idx) => (
            <article
              key={goal.title}
              className="entry-fade mk-fighter-card p-6"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "8px", lineHeight: 1 }}>{goal.icon}</div>
              <div className="mk-label mb-3">竞技目标 · 0{idx + 1}</div>
              <h2 className="mk-section">{goal.title}</h2>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: '1.85', marginTop: '12px' }}>
                {goal.body}
              </p>
            </article>
          ))}
        </section>

        {/* ── STEPS + LEADERBOARD ── */}
        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="entry-fade mk-panel p-6">
            <div className="mk-label-red mb-2">核心循环</div>
            <h2 className="mk-section mb-6">先构筑，再冲榜</h2>
            <div className="flex flex-col gap-4">
              {steps.map((step, index) => (
                <div key={step.title} className="mk-panel-inset p-4 flex gap-4 items-start">
                  <div style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '2.2rem', lineHeight: 1, color: 'var(--red)', textShadow: '0 0 14px rgba(200,0,0,0.5)', minWidth: '3rem', paddingTop: '2px' }}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.95rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-bright)', marginBottom: '6px' }}>
                      {step.title}
                    </p>
                    <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.75' }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="entry-fade mk-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <div className="mk-label-red mb-2">排行榜预览</div>
                <h2 className="mk-section">谁在统治当前竞技场</h2>
              </div>
              <Link className="mk-button-ghost px-4 py-2" href="/arena/leaderboard">
                完整榜单
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {leaderboard.length ? (
                leaderboard.map((entry) => (
                  <div key={entry.competitorId} className="mk-rank-row">
                    <div className="flex items-center gap-4">
                      <span className="mk-rank-number">#{entry.rank}</span>
                      <div>
                        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.95rem', color: 'var(--text-bright)' }}>
                          {entry.displayName}
                        </p>
                        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {entry.wins}胜 {entry.losses}负 · 连胜 {entry.currentStreak}
                        </p>
                      </div>
                    </div>
                    <span className="mk-badge-gold">{entry.rating}</span>
                  </div>
                ))
              ) : (
                <div className="mk-status">还没有真实排位数据。先开一场 battle，榜单就会立刻开始竞争。</div>
              )}
            </div>
          </article>
        </section>

        {/* ── RECENT BATTLES + SOUL TALENTS ── */}
        <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <article className="entry-fade mk-panel p-6">
            <div className="mk-label-red mb-2">最近关键对局</div>
            <h2 className="mk-section mb-6">每一场都会改写榜单</h2>
            <div className="flex flex-col gap-4">
              {recentBattles.length ? (
                recentBattles.map((battle) => (
                  <article key={battle.id} className="mk-highlight">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mk-badge mb-2">{battle.competition?.stakesLabel ?? "战报归档"}</div>
                        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                          {new Date(battle.createdAt).toLocaleString()}
                        </p>
                        <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.95rem', color: 'var(--text-bright)', marginBottom: '4px' }}>
                          {battle.roomTitle}
                        </p>
                        <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--gold)' }}>
                          胜者：{winnerLabel(battle.winnerId, battle.playerDisplayName, battle.defenderDisplayName)}
                        </p>
                      </div>
                      <Link className="mk-button-ghost px-4 py-2" href={`/arena/${battle.id}`}>
                        打开回放
                      </Link>
                    </div>
                  </article>
                ))
              ) : (
                <div className="mk-status">真实战报会在这里显示，包含积分变化、连胜变化和关键标签。</div>
              )}
            </div>
          </article>

          <article className="entry-fade mk-panel p-6">
            <div className="mk-label-red mb-2">Soul 天赋</div>
            <h2 className="mk-section mb-6">五项天赋决定你的比赛风格</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(soulLabels).map(([key, label], index) => (
                <div key={key} className="mk-panel-inset p-4">
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '0.58rem', letterSpacing: '0.32em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: '5px' }}>
                    0{index + 1}
                  </p>
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', fontSize: '1rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>
                    {label}
                  </p>
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: '1.75' }}>
                    {key === "ferocity" && "决定正面压制和爆发输出。"}
                    {key === "guard" && "决定防守稳定性与抗崩盘能力。"}
                    {key === "insight" && "决定读弱点、拆前提与反制效率。"}
                    {key === "tempo" && "决定先手、连段和舞台节奏。"}
                    {key === "resolve" && "决定长局纪律与规则续航。"}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* ── CLASSIC DEMOS ── */}
        <section className="entry-fade mk-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <div className="mk-label-red mb-2">经典演示</div>
              <h2 className="mk-section">保留样本用于讲解玩法</h2>
            </div>
            <Link className="mk-button px-6 py-3" href="/arena">
              直接开始排位
            </Link>
          </div>
          <hr className="mk-divider mb-6" />
          <div className="grid gap-4 lg:grid-cols-3">
            {classics.map((battle, index) => {
              const copy = classicCaseCopy[index] ?? classicCaseCopy[0];
              return (
                <article key={battle.id} className="mk-highlight">
                  <div className="mk-badge mb-3">{copy.title}</div>
                  <p style={{ fontFamily: 'Impact, Arial Black, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--text-bright)', marginBottom: '8px' }}>
                    {copy.note}
                  </p>
                  <p style={{ fontFamily: "'Courier New', monospace", fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: '1.75', marginBottom: '12px' }}>
                    这些是首页保留的本地 demo 战报，用来说明玩法与镜头语言，不参与真实冲榜。
                  </p>
                  <hr className="mk-divider-subtle mb-3" />
                  <div style={{ fontFamily: "'Courier New', monospace", fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <p>终局比分 <span style={{ color: 'var(--gold)' }}>{battle.finalScore.player} : {battle.finalScore.defender}</span></p>
                    <p style={{ marginTop: '4px' }}>下一位焦点：{battle.challengerPreview.displayName}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

      </div>
    </main>
    </>
  );
}
