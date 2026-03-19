import Link from "next/link";

import { ArenaHistoryBoard } from "@/components/arena-history-board";
import {
  getArenaFeaturedCompetitor,
  listArenaBattleSummariesWithCompetition,
} from "@/lib/arena-competition";

export const dynamic = "force-dynamic";

export default function ArenaHistoryPage() {
  const battles = listArenaBattleSummariesWithCompetition(100);
  const featured = getArenaFeaturedCompetitor();

  return (
    <main className="scanlines relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10" style={{ color: "var(--text)" }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="entry-fade mk-panel px-6 py-8 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="mk-badge">Battle Archive</div>
              <h1 className="mk-title mk-title-anim">战绩中心</h1>
              <p style={{ fontFamily: "'Courier New', monospace", fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: "1.85", maxWidth: "52ch" }}>
                这里不只保存 battle package，还会回看每一场排位战如何改变积分、排名和连胜。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="mk-button px-5 py-3" href="/arena">返回竞技场</Link>
              <Link className="mk-button-ghost px-5 py-3" href="/arena/leaderboard">查看排行榜</Link>
            </div>
          </div>
        </section>

        <ArenaHistoryBoard battles={battles} featured={featured} />
      </div>
    </main>
  );
}
