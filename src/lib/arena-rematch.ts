import { resolveArenaParticipants } from "@/lib/arena-participants";
import { getBattlePackage, getBattleSetup, saveBattleSetup } from "@/lib/arena-store";
import type { ArenaParticipantSource, BattlePackage, BattleSetupRecord } from "@/lib/arena-types";

export const deriveSetupFromBattle = (battle: BattlePackage): BattleSetupRecord => ({
  createdAt: new Date().toISOString(),
  id: battle.setupId ?? battle.id,
  originBattleId: battle.id,
  overrides: {
    alpha: battle.player.buildInputSnapshot,
    beta: battle.defender.buildInputSnapshot,
  },
  participants: battle.participantRefs,
  topicId: battle.topic.id,
  topicSnapshot: battle.topic,
});

export const createRematchSetupFromBattle = (battleId: string) => {
  const battle = getBattlePackage(battleId);

  if (!battle) {
    return null;
  }

  const setup = deriveSetupFromBattle(battle);

  return saveBattleSetup({
    originBattleId: setup.originBattleId ?? null,
    overrides: setup.overrides,
    participants: setup.participants,
    topicId: setup.topicId,
    topicSnapshot: setup.topicSnapshot,
  });
};

export const getResolvedBattleSetup = async (setupId: string): Promise<{
  participants: ArenaParticipantSource[];
  setup: BattleSetupRecord;
} | null> => {
  const setup = getBattleSetup(setupId);

  if (!setup) {
    return null;
  }

  return {
    participants: await resolveArenaParticipants(setup.participants),
    setup,
  };
};
