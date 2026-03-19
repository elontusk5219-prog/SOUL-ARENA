"use client";

import { useEffect, useState } from "react";

type BattleSummary = {
  id: string;
  roomTitle: string;
  playerDisplayName: string;
  defenderDisplayName: string;
  winnerId: string;
  createdAt: string;
};

type LiveSession = {
  battleId: string | null;
  startAt: string | null;
  secondsUntilStart: number | null;
};

const DEMO_BATTLES = [
  { id: "demo-1", roomTitle: "理性 VS 感性", playerDisplayName: "ALEX", defenderDisplayName: "ZOE", winnerId: "player" },
  { id: "demo-2", roomTitle: "秩序 VS 混沌", playerDisplayName: "TITAN", defenderDisplayName: "VIPER", winnerId: "defender" },
  { id: "demo-3", roomTitle: "进攻 VS 防守", playerDisplayName: "STORM", defenderDisplayName: "SHIELD", winnerId: "player" },
];

function winnerLabel(winnerId: string, player: string, defender: string) {
  if (winnerId === "player") return player;
  if (winnerId === "defender") return defender;
  return winnerId;
}

export function BattleTicker() {
  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);

  useEffect(() => {
    void fetch("/api/arena/history", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { battles?: BattleSummary[] } | null) => {
        if (data?.battles?.length) {
          setBattles(data.battles.slice(0, 8));
        }
      })
      .catch(() => null);

    void fetch("/api/arena/live", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LiveSession | null) => {
        if (data) setLiveSession(data);
      })
      .catch(() => null);
  }, []);

  const displayBattles = battles.length ? battles : DEMO_BATTLES;
  const tickerItems = [...displayBattles, ...displayBattles]; // duplicate for seamless loop
  const isLive = !!liveSession?.battleId;

  return (
    <div>
      {/* LIVE indicator */}
      {isLive && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          padding: "6px 0",
          marginBottom: "0",
          background: "rgba(200,0,0,0.12)",
          borderBottom: "1px solid rgba(200,0,0,0.3)",
        }}>
          <span className="live-dot" />
          <span style={{
            fontFamily: "Impact, Arial Black, sans-serif",
            fontSize: "0.68rem",
            letterSpacing: "0.4em",
            color: "var(--red-bright)",
            textTransform: "uppercase",
            textShadow: "0 0 8px rgba(255,30,0,0.6)",
          }}>
            LIVE NOW — 竞技场正在进行对局
          </span>
          <span className="live-dot" />
        </div>
      )}

      {/* Ticker */}
      <div style={{
        background: "rgba(0,0,0,0.85)",
        borderBottom: "1px solid rgba(120,0,0,0.4)",
        overflow: "hidden",
        height: "32px",
        display: "flex",
        alignItems: "center",
      }}>
        <div style={{
          fontFamily: "Impact, Arial Black, sans-serif",
          fontSize: "0.6rem",
          letterSpacing: "0.3em",
          color: "var(--red)",
          padding: "0 14px",
          borderRight: "1px solid rgba(120,0,0,0.4)",
          flexShrink: 0,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          LATEST BATTLES
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div className="battle-ticker-inner">
            {tickerItems.map((battle, idx) => (
              <span
                key={`${battle.id}-${idx}`}
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: "0.7rem",
                  color: "var(--text-dim)",
                  padding: "0 30px",
                  borderRight: "1px solid rgba(80,0,0,0.3)",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "var(--gold)", fontFamily: "Impact, Arial Black, sans-serif", letterSpacing: "0.06em" }}>
                  {("playerDisplayName" in battle ? battle.playerDisplayName : "")} vs {("defenderDisplayName" in battle ? battle.defenderDisplayName : "")}
                </span>
                {"  "}·{"  "}
                <span style={{ color: "var(--text-muted)" }}>{battle.roomTitle}</span>
                {"  "}·{"  "}
                <span style={{ color: "var(--red)" }}>
                  胜者: {winnerLabel(battle.winnerId, "playerDisplayName" in battle ? battle.playerDisplayName : "", "defenderDisplayName" in battle ? battle.defenderDisplayName : "")}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
