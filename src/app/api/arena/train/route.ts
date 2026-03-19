import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getBattlePackage } from "@/lib/arena-store";
import { fetchSecondMeJsonForSlot } from "@/lib/secondme";
import type { BattlePackage } from "@/lib/arena-types";

const idempotencyKey = (slot: string, battleId: string) =>
  createHash("sha256").update(`train:${slot}:${battleId}`).digest("hex");

const buildTrainingEvent = (battle: BattlePackage, slot: "alpha" | "beta") => {
  const fighter = slot === "alpha" ? battle.player : battle.defender;
  const opponent = slot === "alpha" ? battle.defender : battle.player;
  const won = battle.winnerId === fighter.id;
  const highlightTexts = battle.highlights
    .filter((h) => h.actorId === fighter.id)
    .map((h) => `${h.label}: ${h.description}`);

  return {
    action: won ? "battle_win" : "battle_loss",
    actionLabel: won ? "赢下训练对战" : "输掉训练对战",
    channel: {
      id: battle.id,
      kind: "soul_arena_training",
      meta: { slot },
      url: `/arena/${battle.id}`,
    },
    displayText: `${fighter.displayName}${won ? "赢下了" : "输掉了"}《${battle.roomTitle}》的训练对战`,
    eventDesc: `在 Soul Arena 训练中，${fighter.displayName} 对阵 ${opponent.displayName}，议题：${battle.topic.title}。${won ? "获胜" : "败北"}。得分：${won ? battle.finalScore[slot === "alpha" ? "player" : "defender"] : battle.finalScore[slot === "alpha" ? "defender" : "player"]}。`,
    eventTime: Date.now(),
    idempotencyKey: idempotencyKey(slot, battle.id),
    importance: won ? 0.78 : 0.55,
    payload: {
      battleId: battle.id,
      topic: battle.topic.title,
      outcome: won ? "win" : "lose",
      opponentName: opponent.displayName,
      score: battle.finalScore[slot === "alpha" ? "player" : "defender"],
      opponentScore: battle.finalScore[slot === "alpha" ? "defender" : "player"],
      highlights: highlightTexts,
      timestamp: battle.createdAt,
    },
    refs: [
      {
        contentPreview: `${battle.roomTitle} | ${fighter.declaration}`,
        objectId: battle.id,
        objectType: "battle",
        snapshot: {
          capturedAt: Date.now(),
          text: `${battle.roomTitle}。胜者：${won ? fighter.displayName : opponent.displayName}。${fighter.displayName} 得分：${battle.finalScore[slot === "alpha" ? "player" : "defender"]}。${highlightTexts.join(" ")}`,
        },
        type: "battle_result",
        url: `/arena/${battle.id}`,
      },
    ],
  };
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { battleId?: string };

  if (!body.battleId) {
    return NextResponse.json({ message: "缺少 battleId" }, { status: 400 });
  }

  const battle = getBattlePackage(body.battleId);

  if (!battle) {
    return NextResponse.json({ message: "战斗记录未找到" }, { status: 404 });
  }

  const slots: Array<"alpha" | "beta"> = ["alpha", "beta"];
  const secondmeSlots = slots.filter((slot) => {
    const ref = battle.participantRefs.find((r) => r.slot === slot);
    return ref?.provider === "secondme";
  });

  if (secondmeSlots.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "无 SecondMe 参与者，跳过训练注入",
      trained: [],
    });
  }

  const results = await Promise.allSettled(
    secondmeSlots.map((slot) =>
      fetchSecondMeJsonForSlot<{ eventId?: string; isDuplicate?: boolean }>(
        slot,
        "/api/secondme/agent_memory/ingest",
        {
          body: JSON.stringify(buildTrainingEvent(battle, slot)),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      ),
    ),
  );

  const trained = results.map((result, index) => ({
    slot: secondmeSlots[index],
    ok: result.status === "fulfilled",
    error:
      result.status === "rejected"
        ? String(result.reason instanceof Error ? result.reason.message : result.reason)
        : null,
  }));

  return NextResponse.json({ ok: true, battleId: body.battleId, trained });
}
