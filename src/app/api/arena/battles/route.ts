import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getArenaBattlePackageWithCompetition } from "@/lib/arena-competition";
import { createBattlePackage } from "@/lib/arena-engine";
import { resolveArenaParticipants } from "@/lib/arena-participants";
import { saveBattlePackage, saveBattleSetup } from "@/lib/arena-store";
import { fetchSecondMeJsonForSlot } from "@/lib/secondme";
import type { ArenaBattleSetup, BattlePackage } from "@/lib/arena-types";

const idempotencyKey = (slot: string, battleId: string) =>
  createHash("sha256").update(`battle:${slot}:${battleId}`).digest("hex");

const buildMemoryEvent = (battle: BattlePackage, slot: "alpha" | "beta") => {
  const fighter = slot === "alpha" ? battle.player : battle.defender;
  const won = battle.winnerId === fighter.id;

  return {
    action: won ? "battle_win" : "battle_loss",
    actionLabel: won ? "赢下对战" : "输掉对战",
    channel: {
      id: battle.id,
      kind: "soul_arena",
      meta: {
        slot,
      },
      url: `/arena/${battle.id}`,
    },
    displayText: `${fighter.displayName}${won ? "赢下了" : "输掉了"}《${battle.roomTitle}》`,
    eventDesc: `${fighter.displayName}${won ? "赢下了" : "输掉了"}一场 Soul Arena 对战。`,
    eventTime: Date.now(),
    idempotencyKey: idempotencyKey(slot, battle.id),
    importance: won ? 0.84 : 0.62,
    payload: {
      finalScore: battle.finalScore,
      roomTitle: battle.roomTitle,
      topicId: battle.topic.id,
      winnerId: battle.winnerId,
    },
    refs: [
      {
        contentPreview: `${battle.roomTitle} | ${fighter.declaration}`,
        objectId: battle.id,
        objectType: "battle",
        snapshot: {
          capturedAt: Date.now(),
          text: `${battle.roomTitle}。胜者：${battle.winnerId}。${fighter.displayName}：${fighter.buildSummary.join(" ")}`,
        },
        type: "battle_result",
        url: `/arena/${battle.id}`,
      },
    ],
  };
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<ArenaBattleSetup>;

  if (!body.topicId || !body.participants?.length) {
    return NextResponse.json(
      {
        message: "缺少 topicId 或 participants",
      },
      { status: 400 },
    );
  }

  const participants = await resolveArenaParticipants(body.participants);
  const disconnected = participants.filter((participant) => !participant.connected);

  if (disconnected.length > 0) {
    return NextResponse.json(
      {
        message: "甲方和乙方都必须先完成来源连接",
        participants,
      },
      { status: 400 },
    );
  }

  const setup = saveBattleSetup({
    originBattleId: body.originBattleId ?? null,
    overrides: body.overrides ?? {},
    participants: body.participants,
    topicId: body.topicId,
    topicSnapshot: body.topicSnapshot,
  });

  const battle = await createBattlePackage(
    {
      ...body,
      originBattleId: body.originBattleId ?? null,
      overrides: body.overrides ?? {},
      participants: body.participants,
      setupId: setup.id,
      topicId: body.topicId,
      topicSnapshot: body.topicSnapshot,
    } as ArenaBattleSetup,
    participants,
  );

  saveBattlePackage(battle);
  const hydratedBattle = getArenaBattlePackageWithCompetition(battle.id) ?? battle;
  await Promise.allSettled(
    body.participants
      .filter(
        (participant): participant is { provider: "secondme"; slot: "alpha" | "beta" } =>
          participant.provider === "secondme" &&
          (participant.slot === "alpha" || participant.slot === "beta"),
      )
      .map((participant) =>
        fetchSecondMeJsonForSlot<{ eventId?: string; isDuplicate?: boolean }>(
          participant.slot,
          "/api/secondme/agent_memory/ingest",
          {
            body: JSON.stringify(buildMemoryEvent(battle, participant.slot)),
            headers: {
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        ),
      ),
  );

  return NextResponse.json(hydratedBattle);
}
