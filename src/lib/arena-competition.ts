import { getBattlePackage, listBattlePackages } from "@/lib/arena-store";
import type {
  ArenaBattleCompetition,
  ArenaBattleCompetitionSide,
  ArenaBattleResult,
  ArenaChallengeSuggestion,
  ArenaCompetitorIdentity,
  ArenaCompetitorProfile,
  ArenaLeaderboardEntry,
  ArenaParticipantCompetitiveProfile,
  ArenaParticipantSource,
  ArenaRecentForm,
  BattlePackage,
  BattleSummary,
  FighterProfile,
} from "@/lib/arena-types";

const BASE_RATING = 1000;
const K_FACTOR = 32;
const MIN_RATING_DELTA = 8;
const MAX_RATING_DELTA = 24;
const RECENT_FORM_LIMIT = 5;

type MutableCompetitorStats = ArenaCompetitorIdentity & {
  bestStreak: number;
  currentStreak: number;
  lastBattleAt: string | null;
  lastBattleId: string | null;
  lastBattleTitle: string | null;
  lastResult: ArenaBattleResult | null;
  losses: number;
  rating: number;
  recentForm: ArenaRecentForm[];
  totalMatches: number;
  wins: number;
};

type CompetitionSnapshot = {
  battleCompetitionById: Map<string, ArenaBattleCompetition>;
  competitorIndex: Map<string, ArenaCompetitorProfile>;
  leaderboard: ArenaLeaderboardEntry[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

const buildCompetitorId = ({
  displayId,
  displayName,
  participantId,
  provider,
  secondMeUserId,
  slot,
}: {
  displayId?: string | null;
  displayName: string;
  participantId?: string;
  provider: ArenaCompetitorIdentity["provider"];
  secondMeUserId?: string | null;
  slot?: ArenaCompetitorIdentity["slot"];
}) => {
  const stablePart =
    provider === "openclaw"
      ? displayId?.trim() ||
        `${slot ?? "unknown"}:${toSlug(displayName) || "anonymous"}`
      : secondMeUserId?.trim() ||
        participantId?.trim() ||
        `${slot ?? "unknown"}:${toSlug(displayName) || "anonymous"}`;

  return `${provider}:${stablePart}`;
};

const createIdentityFromFighter = (
  fighter: FighterProfile,
  generationMode: BattlePackage["sourceMeta"]["generationMode"],
): ArenaCompetitorIdentity | null => {
  if (generationMode !== "orchestrated") {
    return null;
  }

  return {
    competitorId: buildCompetitorId({
      displayId: fighter.source.displayId,
      displayName: fighter.displayName,
      participantId: fighter.source.participantId,
      provider: fighter.source.provider,
      secondMeUserId: fighter.source.secondMeUserId,
      slot: fighter.source.slot,
    }),
    displayName: fighter.displayName,
    provider: fighter.source.provider,
    secondMeUserId: fighter.source.secondMeUserId ?? null,
    slot: fighter.source.slot,
  };
};

const createIdentityFromParticipant = (
  participant: ArenaParticipantSource,
): ArenaCompetitorIdentity | null => {
  if (!participant.connected || !participant.displayName) {
    return null;
  }

  return {
    competitorId: buildCompetitorId({
      displayId: participant.displayId,
      displayName: participant.displayName,
      provider: participant.provider,
      secondMeUserId: participant.secondMeUserId,
      slot: participant.slot,
    }),
    displayName: participant.displayName,
    provider: participant.provider,
    secondMeUserId: participant.secondMeUserId,
    slot: participant.slot,
  };
};

const createMutableCompetitor = (
  identity: ArenaCompetitorIdentity,
): MutableCompetitorStats => ({
  ...identity,
  bestStreak: 0,
  currentStreak: 0,
  lastBattleAt: null,
  lastBattleId: null,
  lastBattleTitle: null,
  lastResult: null,
  losses: 0,
  rating: BASE_RATING,
  recentForm: [],
  totalMatches: 0,
  wins: 0,
});

const winRate = (entry: Pick<MutableCompetitorStats, "wins" | "totalMatches">) =>
  entry.totalMatches > 0 ? entry.wins / entry.totalMatches : 0;

const recentWins = (entry: Pick<MutableCompetitorStats, "recentForm">) =>
  entry.recentForm.filter((result) => result === "W").length;

const sortCompetitors = (entries: MutableCompetitorStats[]) =>
  [...entries].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    if (right.currentStreak !== left.currentStreak) {
      return right.currentStreak - left.currentStreak;
    }

    const winRateGap = winRate(right) - winRate(left);

    if (Math.abs(winRateGap) > 0.0001) {
      return winRateGap > 0 ? 1 : -1;
    }

    const recentWinGap = recentWins(right) - recentWins(left);

    if (recentWinGap !== 0) {
      return recentWinGap;
    }

    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return left.displayName.localeCompare(right.displayName, "zh-CN");
  });

const createRankMap = (statsById: Map<string, MutableCompetitorStats>) =>
  new Map(
    sortCompetitors([...statsById.values()]).map((entry, index) => [
      entry.competitorId,
      index + 1,
    ]),
  );

const calculateWinDelta = (winnerRating: number, loserRating: number) => {
  const expectedScore =
    1 / (1 + 10 ** ((loserRating - winnerRating) / 400));

  return clamp(
    Math.round(K_FACTOR * (1 - expectedScore)),
    MIN_RATING_DELTA,
    MAX_RATING_DELTA,
  );
};

const pushForm = (
  currentForm: ArenaRecentForm[],
  result: ArenaRecentForm,
) => [result, ...currentForm].slice(0, RECENT_FORM_LIMIT);

const buildStakesLabel = ({
  endedOpponentStreakCount,
  isUpsetWin,
  loserBeforeRank,
  winnerBeforeRank,
}: {
  endedOpponentStreakCount: number;
  isUpsetWin: boolean;
  loserBeforeRank: number | null;
  winnerBeforeRank: number | null;
}) => {
  if (endedOpponentStreakCount >= 2) {
    return `终结对手 ${endedOpponentStreakCount} 连胜`;
  }

  if (isUpsetWin) {
    return "下克上冲榜";
  }

  if (
    winnerBeforeRank !== null &&
    loserBeforeRank !== null &&
    winnerBeforeRank > loserBeforeRank
  ) {
    return "越级挑战成功";
  }

  return "稳住排位";
};

const createBattleSideCompetition = ({
  competitorId,
  displayName,
  rankAfter,
  rankBefore,
  ratingAfter,
  ratingBefore,
  result,
  scoreDelta,
  streakAfter,
  streakBefore,
}: {
  competitorId: string;
  displayName: string;
  rankAfter: number | null;
  rankBefore: number | null;
  ratingAfter: number;
  ratingBefore: number;
  result: ArenaBattleResult;
  scoreDelta: number;
  streakAfter: number;
  streakBefore: number;
}): ArenaBattleCompetitionSide => ({
  competitorId,
  displayName,
  rankAfter,
  rankBefore,
  ratingAfter,
  ratingBefore,
  result,
  scoreDelta,
  streakAfter,
  streakBefore,
});

const toBattleSummary = (
  battle: BattlePackage,
  competition?: ArenaBattleCompetition | null,
): BattleSummary => ({
  competition: competition ?? null,
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

const buildChallengeSuggestion = (
  profile: Pick<
    ArenaCompetitorProfile,
    "competitorId" | "currentStreak" | "displayName" | "rank" | "rating"
  >,
  leaderboard: ArenaLeaderboardEntry[],
): ArenaChallengeSuggestion | null => {
  const opponents = leaderboard.filter(
    (entry) => entry.competitorId !== profile.competitorId,
  );

  if (!opponents.length) {
    return null;
  }

  const currentRank = profile.rank;
  const preferredOpponent =
    currentRank !== null && currentRank > 1
      ? opponents.find((entry) => entry.rank === currentRank - 1) ?? opponents[0]
      : opponents.find((entry) => entry.currentStreak >= 2) ?? opponents[0];

  if (!preferredOpponent) {
    return null;
  }

  const projectedWinDelta = calculateWinDelta(
    profile.rating,
    preferredOpponent.rating,
  );
  const projectedLossDelta = -calculateWinDelta(
    preferredOpponent.rating,
    profile.rating,
  );
  const reason =
    profile.rank && preferredOpponent.rank && preferredOpponent.rank < profile.rank
      ? `击败第 ${preferredOpponent.rank} 名可直接冲榜`
      : preferredOpponent.currentStreak >= 2
        ? `对手正处于 ${preferredOpponent.currentStreak} 连胜，适合狙击`
        : "这是当前最接近且最有价值的下一战";

  return {
    competitorId: preferredOpponent.competitorId,
    currentStreak: preferredOpponent.currentStreak,
    displayName: preferredOpponent.displayName,
    projectedLossDelta,
    projectedWinDelta,
    rank: preferredOpponent.rank,
    rating: preferredOpponent.rating,
    reason,
  };
};

const toArenaProfile = (
  stats: MutableCompetitorStats,
  rank: number | null,
  leaderboard: ArenaLeaderboardEntry[],
): ArenaCompetitorProfile => {
  const baseProfile: ArenaCompetitorProfile = {
    bestStreak: stats.bestStreak,
    competitorId: stats.competitorId,
    currentStreak: stats.currentStreak,
    displayName: stats.displayName,
    lastBattleAt: stats.lastBattleAt,
    lastBattleId: stats.lastBattleId,
    lastBattleTitle: stats.lastBattleTitle,
    lastResult: stats.lastResult,
    losses: stats.losses,
    provider: stats.provider,
    rank,
    rating: stats.rating,
    recentForm: stats.recentForm,
    secondMeUserId: stats.secondMeUserId,
    slot: stats.slot,
    suggestion: null,
    totalMatches: stats.totalMatches,
    winRate: Number.parseFloat((winRate(stats) * 100).toFixed(1)),
    wins: stats.wins,
  };

  return {
    ...baseProfile,
    suggestion: buildChallengeSuggestion(baseProfile, leaderboard),
  };
};

const buildCompetitionSnapshot = (
  battles: BattlePackage[],
): CompetitionSnapshot => {
  const battleCompetitionById = new Map<string, ArenaBattleCompetition>();
  const statsById = new Map<string, MutableCompetitorStats>();

  for (const battle of battles) {
    const playerIdentity = createIdentityFromFighter(
      battle.player,
      battle.sourceMeta.generationMode,
    );
    const defenderIdentity = createIdentityFromFighter(
      battle.defender,
      battle.sourceMeta.generationMode,
    );

    if (
      !playerIdentity ||
      !defenderIdentity ||
      playerIdentity.competitorId === defenderIdentity.competitorId
    ) {
      continue;
    }

    if (!statsById.has(playerIdentity.competitorId)) {
      statsById.set(
        playerIdentity.competitorId,
        createMutableCompetitor(playerIdentity),
      );
    }

    if (!statsById.has(defenderIdentity.competitorId)) {
      statsById.set(
        defenderIdentity.competitorId,
        createMutableCompetitor(defenderIdentity),
      );
    }

    const playerStats = statsById.get(playerIdentity.competitorId);
    const defenderStats = statsById.get(defenderIdentity.competitorId);

    if (!playerStats || !defenderStats) {
      continue;
    }

    const ranksBefore = createRankMap(statsById);
    const playerWon = battle.winnerId === battle.player.id;
    const winnerStats = playerWon ? playerStats : defenderStats;
    const loserStats = playerWon ? defenderStats : playerStats;
    const winnerBeforeRank =
      ranksBefore.get(winnerStats.competitorId) ?? null;
    const loserBeforeRank =
      ranksBefore.get(loserStats.competitorId) ?? null;
    const winnerRatingBefore = winnerStats.rating;
    const loserRatingBefore = loserStats.rating;
    const winnerStreakBefore = winnerStats.currentStreak;
    const loserStreakBefore = loserStats.currentStreak;
    const scoreDelta = calculateWinDelta(winnerRatingBefore, loserRatingBefore);

    winnerStats.rating += scoreDelta;
    winnerStats.wins += 1;
    winnerStats.totalMatches += 1;
    winnerStats.currentStreak += 1;
    winnerStats.bestStreak = Math.max(
      winnerStats.bestStreak,
      winnerStats.currentStreak,
    );
    winnerStats.lastBattleAt = battle.createdAt;
    winnerStats.lastBattleId = battle.id;
    winnerStats.lastBattleTitle = battle.roomTitle;
    winnerStats.lastResult = "win";
    winnerStats.recentForm = pushForm(winnerStats.recentForm, "W");

    loserStats.rating -= scoreDelta;
    loserStats.losses += 1;
    loserStats.totalMatches += 1;
    loserStats.currentStreak = 0;
    loserStats.lastBattleAt = battle.createdAt;
    loserStats.lastBattleId = battle.id;
    loserStats.lastBattleTitle = battle.roomTitle;
    loserStats.lastResult = "loss";
    loserStats.recentForm = pushForm(loserStats.recentForm, "L");

    const ranksAfter = createRankMap(statsById);
    const isUpsetWin = winnerRatingBefore + 40 <= loserRatingBefore;
    const endedOpponentStreak = loserStreakBefore >= 2;
    const competition: ArenaBattleCompetition = {
      defender: createBattleSideCompetition({
        competitorId: defenderStats.competitorId,
        displayName: defenderStats.displayName,
        rankAfter: ranksAfter.get(defenderStats.competitorId) ?? null,
        rankBefore: ranksBefore.get(defenderStats.competitorId) ?? null,
        ratingAfter: defenderStats.rating,
        ratingBefore: playerWon
          ? loserRatingBefore
          : winnerRatingBefore,
        result: playerWon ? "loss" : "win",
        scoreDelta: playerWon ? -scoreDelta : scoreDelta,
        streakAfter: defenderStats.currentStreak,
        streakBefore: playerWon ? loserStreakBefore : winnerStreakBefore,
      }),
      endedOpponentStreak,
      endedOpponentStreakCount: endedOpponentStreak ? loserStreakBefore : 0,
      isUpsetWin,
      player: createBattleSideCompetition({
        competitorId: playerStats.competitorId,
        displayName: playerStats.displayName,
        rankAfter: ranksAfter.get(playerStats.competitorId) ?? null,
        rankBefore: ranksBefore.get(playerStats.competitorId) ?? null,
        ratingAfter: playerStats.rating,
        ratingBefore: playerWon
          ? winnerRatingBefore
          : loserRatingBefore,
        result: playerWon ? "win" : "loss",
        scoreDelta: playerWon ? scoreDelta : -scoreDelta,
        streakAfter: playerStats.currentStreak,
        streakBefore: playerWon ? winnerStreakBefore : loserStreakBefore,
      }),
      stakesLabel: buildStakesLabel({
        endedOpponentStreakCount: endedOpponentStreak ? loserStreakBefore : 0,
        isUpsetWin,
        loserBeforeRank,
        winnerBeforeRank,
      }),
    };

    battleCompetitionById.set(battle.id, competition);
  }

  const rankedEntries = sortCompetitors([...statsById.values()]).map(
    (entry, index, ranked) =>
      toArenaProfile(
        entry,
        index + 1,
        ranked.map((candidate, candidateIndex) => ({
          ...toArenaProfile(candidate, candidateIndex + 1, []),
        })),
      ),
  );

  const leaderboard = rankedEntries.map((entry) => ({
    ...entry,
    suggestion: buildChallengeSuggestion(entry, rankedEntries),
  }));
  const competitorIndex = new Map(
    leaderboard.map((entry) => [entry.competitorId, entry]),
  );

  return {
    battleCompetitionById,
    competitorIndex,
    leaderboard,
  };
};

const getSnapshot = () =>
  buildCompetitionSnapshot(listBattlePackages({ order: "asc" }));

const createProvisionalProfile = (
  identity: ArenaCompetitorIdentity,
  leaderboard: ArenaLeaderboardEntry[],
): ArenaCompetitorProfile => {
  const provisional: ArenaCompetitorProfile = {
    bestStreak: 0,
    competitorId: identity.competitorId,
    currentStreak: 0,
    displayName: identity.displayName,
    lastBattleAt: null,
    lastBattleId: null,
    lastBattleTitle: null,
    lastResult: null,
    losses: 0,
    provider: identity.provider,
    rank: null,
    rating: BASE_RATING,
    recentForm: [],
    secondMeUserId: identity.secondMeUserId,
    slot: identity.slot,
    suggestion: null,
    totalMatches: 0,
    winRate: 0,
    wins: 0,
  };

  return {
    ...provisional,
    suggestion: buildChallengeSuggestion(provisional, leaderboard),
  };
};

export const getArenaLeaderboard = (limit = 10) =>
  getSnapshot().leaderboard.slice(0, Math.max(1, Math.min(limit, 50)));

export const getArenaBattlePackageWithCompetition = (battleId: string) => {
  const battle = getBattlePackage(battleId);

  if (!battle) {
    return null;
  }

  const snapshot = getSnapshot();

  return {
    ...battle,
    competition: snapshot.battleCompetitionById.get(battle.id) ?? null,
  } satisfies BattlePackage;
};

export const listArenaBattleSummariesWithCompetition = (limit = 50) => {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const battles = listBattlePackages({ limit: safeLimit, order: "desc" });
  const snapshot = getSnapshot();

  return battles.map((battle) =>
    toBattleSummary(
      battle,
      snapshot.battleCompetitionById.get(battle.id) ?? null,
    ),
  );
};

export const getArenaCompetitorProfile = (competitorId: string) =>
  getSnapshot().competitorIndex.get(competitorId) ?? null;

export const getArenaProfilesForParticipants = (
  participants: ArenaParticipantSource[],
): ArenaParticipantCompetitiveProfile[] => {
  const snapshot = getSnapshot();

  return participants
    .filter((participant) => participant.slot === "alpha" || participant.slot === "beta")
    .map((participant) => {
      const identity = createIdentityFromParticipant(participant);
      const profile = identity
        ? snapshot.competitorIndex.get(identity.competitorId) ??
          createProvisionalProfile(identity, snapshot.leaderboard)
        : null;

      return {
        profile,
        slot: participant.slot,
      };
    });
};

export const getArenaFeaturedCompetitor = () => {
  const leaderboard = getArenaLeaderboard(10);

  if (!leaderboard.length) {
    return null;
  }

  return [...leaderboard].sort((left, right) => {
    if (right.currentStreak !== left.currentStreak) {
      return right.currentStreak - left.currentStreak;
    }

    return right.rating - left.rating;
  })[0] ?? null;
};
