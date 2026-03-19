import { createHash, randomUUID } from "node:crypto";

import { challengerPresets, soulLabels, topicPresets } from "@/lib/arena-presets";
import type {
  BattleEvent,
  BattleHighlight,
  BattlePackage,
  ChallengerPreset,
  BuildCard,
  BuildCardKind,
  FighterBuildInput,
  FighterProfile,
  JudgeVerdict,
  SoulStatKey,
  SoulStats,
  TopicPreset,
} from "@/lib/arena-types";

type LegacyArenaBuildPreview = {
  challenger: ChallengerPreset;
  defender: FighterProfile;
  equipmentNotes: string[];
  matchUpCallout: string;
  player: FighterProfile;
  predictedEdges: string[];
  topic: TopicPreset;
};

type LegacyArenaBattleSetup = {
  challengerId: string;
  player: FighterBuildInput;
  topicId: string;
};

const attackKeywords = [
  "必须",
  "击穿",
  "赢",
  "压制",
  "夺取",
  "主导",
  "抢占",
  "must",
  "force",
  "break",
  "win",
  "pressure",
  "replace",
  "capture",
  "dominate",
];
const defenseKeywords = [
  "边界",
  "稳定",
  "保护",
  "约束",
  "防守",
  "韧性",
  "平衡",
  "规则",
  "boundary",
  "stable",
  "protect",
  "constraint",
  "defend",
  "resilient",
  "balance",
  "rule",
];
const penetrationKeywords = [
  "弱点",
  "裂缝",
  "矛盾",
  "揭露",
  "前提",
  "漏洞",
  "反证",
  "weakness",
  "crack",
  "contradiction",
  "expose",
  "premise",
  "loophole",
  "counter",
];
const speedKeywords = [
  "快",
  "节奏",
  "爆发",
  "立刻",
  "迅速",
  "先手",
  "连段",
  "fast",
  "tempo",
  "burst",
  "instant",
  "rapid",
  "first",
  "swing",
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampInt = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

const countHits = (text: string, keywords: string[]) =>
  keywords.reduce(
    (total, keyword) => total + (text.toLowerCase().includes(keyword) ? 1 : 0),
    0,
  );

const hashToSeed = (input: string) => {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16);
};

const createRng = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const createRadar = (text: string, seed: number) => {
  const rng = createRng(seed);
  const trimmed = text.trim();
  const uniqueChars = new Set(trimmed.replace(/\s+/g, "").split("")).size;
  const punctuation = (trimmed.match(/[!?;:]/g) ?? []).length;
  const lengthScore = clamp(trimmed.length / 2.5, 12, 40);

  return {
    attackability: clampInt(
      28 +
        lengthScore +
        countHits(trimmed, attackKeywords) * 9 +
        punctuation * 4 +
        rng() * 12,
      18,
      96,
    ),
    defensibility: clampInt(
      22 +
        lengthScore +
        countHits(trimmed, defenseKeywords) * 10 +
        countHits(
          trimmed,
          ["if", "because", "therefore", "boundary", "如果", "因为", "所以", "前提"],
        ) * 5 +
        rng() * 10,
      18,
      96,
    ),
    originality: clampInt(
      24 + uniqueChars * 1.2 + punctuation * 2 + rng() * 10,
      16,
      95,
    ),
  };
};

const createCardTrait = (card: Pick<BuildCard, "atk" | "def" | "pen" | "spd">) => {
  const pairs = [
    ["破甲反问", card.pen],
    ["快节奏", card.spd],
    ["重锤主张", card.atk],
    ["盾墙防守", card.def],
  ] as const;

  return [...pairs].sort((a, b) => b[1] - a[1])[0][0];
};

const createCardHint = (kind: BuildCardKind, card: BuildCard) => {
  const prefix =
    kind === "viewpoint"
      ? "观点"
      : kind === "rule"
        ? "规则"
        : "禁忌";
  const posture = card.atk >= card.def ? "偏进攻" : "偏防守";
  const focus =
    card.pen >= 14
      ? "适合命中弱点"
      : card.spd >= 14
        ? "适合抢首轮节奏"
        : "适合稳定换血";

  return `${prefix}${posture}，${focus}。`;
};

const createCard = (
  text: string,
  kind: BuildCardKind,
  index: number,
  seedBase: string,
): BuildCard => {
  const seed = hashToSeed(`${seedBase}:${kind}:${index}:${text}`);
  const rng = createRng(seed);
  const radar = createRadar(text, seed);
  const atk = clampInt(
    radar.attackability / 8 + countHits(text, attackKeywords) * 1.8 + rng() * 2,
    6,
    20,
  );
  const def = clampInt(
    radar.defensibility / 8 + countHits(text, defenseKeywords) * 1.5 + rng() * 2,
    5,
    19,
  );
  const pen = clampInt(
    radar.originality / 10 +
      countHits(text, penetrationKeywords) * 2 +
      countHits(text, ["but", "however", "unless"]) * 1.4 +
      rng() * 2,
    4,
    18,
  );
  const spd = clampInt(
    (radar.attackability + radar.originality) / 18 +
      countHits(text, speedKeywords) * 2 +
      rng() * 2,
    4,
    18,
  );

  const baseCard: BuildCard = {
    atk,
    def,
    hint: "",
    id: `${kind}-${index}`,
    kind,
    pen,
    radar,
    spd,
    text,
    title:
      kind === "viewpoint"
        ? `观点 ${index + 1}`
        : kind === "rule"
          ? "规则核心"
          : "禁忌锚点",
    trait: "",
  };

  return {
    ...baseCard,
    hint: createCardHint(kind, baseCard),
    trait: createCardTrait(baseCard),
  };
};

const deriveSoulStats = (cards: BuildCard[], seedTags: string[]) => {
  const seed = hashToSeed(
    `${seedTags.join("|")}:${cards.map((card) => card.text).join("|")}`,
  );
  const rng = createRng(seed);
  const avgAtk = average(cards.map((card) => card.atk));
  const avgDef = average(cards.map((card) => card.def));
  const avgPen = average(cards.map((card) => card.pen));
  const avgSpd = average(cards.map((card) => card.spd));
  const avgOriginality = average(cards.map((card) => card.radar.originality));
  const tagFactor = clamp(seedTags.length, 0, 8);

  return {
    ferocity: clampInt(42 + avgAtk * 2.2 + tagFactor * 1.6 + rng() * 8, 35, 99),
    guard: clampInt(40 + avgDef * 2.4 + tagFactor * 1.4 + rng() * 8, 35, 99),
    insight: clampInt(38 + avgPen * 2.7 + avgOriginality / 6 + rng() * 8, 35, 99),
    resolve: clampInt(39 + avgDef * 1.8 + avgAtk * 1.1 + rng() * 8, 35, 99),
    tempo: clampInt(36 + avgSpd * 2.6 + avgAtk * 0.8 + rng() * 8, 35, 99),
  } satisfies SoulStats;
};

const getPowerLabel = (soul: SoulStats) => {
  const entries = Object.entries(soul).sort((a, b) => b[1] - a[1]);
  const [top, second] = entries
    .slice(0, 2)
    .map(([key]) => soulLabels[key as SoulStatKey]);
  return `${top} / ${second} 构筑`;
};

const summarizeBuild = (cards: BuildCard[], soul: SoulStats) => {
  const heavyCard = [...cards].sort((a, b) => b.atk + b.pen - (a.atk + a.pen))[0];
  const steadyCard = [...cards].sort((a, b) => b.def + b.spd - (a.def + a.spd))[0];

  return [
    `主武器偏向 ${heavyCard.trait}。`,
    `防守骨架围绕 ${steadyCard.trait} 搭建。`,
    `Soul 核心是 ${getPowerLabel(soul)}。`,
  ];
};

const toFighterProfile = (
  role: FighterProfile["role"],
  input: FighterBuildInput,
  archetype: string,
  aura: string,
  id: string,
) => {
  const viewpoints = input.viewpoints.filter(Boolean).slice(0, 3);
  const cards = [
    ...viewpoints.map((viewpoint, index) =>
      createCard(viewpoint, "viewpoint", index, `${id}:viewpoint`),
    ),
    createCard(input.rule, "rule", 0, `${id}:rule`),
    createCard(input.taboo, "taboo", 0, `${id}:taboo`),
  ];
  const soul = deriveSoulStats(cards, input.soulSeedTags);

  return {
    archetype,
    aura,
    buildSummary: summarizeBuild(cards, soul),
    buildInputSnapshot: input,
    cards,
    declaration: input.declaration,
    displayName: input.displayName,
    health: 100,
    id,
    identitySummary: [],
    memoryAnchors: [],
    powerLabel: getPowerLabel(soul),
    role,
    soul,
    source: {
      configVersion: null,
      connected: false,
      provider: "secondme",
      runtimeReady: false,
      sourceLabel: "Classic Demo",
      slot: role === "challenger" ? "alpha" : "beta",
    },
  } satisfies FighterProfile;
};

const getTopicById = (topicId: string) =>
  topicPresets.find((topic) => topic.id === topicId) ?? topicPresets[0];

const getChallengerById = (challengerId: string) =>
  challengerPresets.find((challenger) => challenger.id === challengerId) ??
  challengerPresets[0];

export const getArenaTopics = () => topicPresets;
export const getArenaChallengers = () => challengerPresets;

const createMatchUpCallout = (player: FighterProfile, defender: FighterProfile) => {
  const offenseGap =
    player.soul.ferocity + player.soul.tempo - defender.soul.guard;
  const insightGap = player.soul.insight - defender.soul.resolve;

  if (insightGap >= 12) {
    return "你在洞察和穿透上占优，重点去撕开对手隐藏前提。";
  }

  if (offenseGap >= 12) {
    return "你的节奏压制更强，优先抢首轮，不要把战线拖长。";
  }

  return "这是一场胶着局，先保住节奏，再把规则卡转成解释优势。";
};

const buildArenaPreview = (setup: LegacyArenaBattleSetup): LegacyArenaBuildPreview => {
  const topic = getTopicById(setup.topicId);
  const challenger = getChallengerById(setup.challengerId);
  const player = toFighterProfile(
    "challenger",
    setup.player,
    "自定义挑战者",
    "Ember Gold",
    "player",
  );
  const defender = toFighterProfile(
    "defender",
    {
      declaration: challenger.declaration,
      displayName: challenger.displayName,
      rule: challenger.rule,
      soulSeedTags: challenger.soulSeedTags,
      taboo: challenger.taboo,
      viewpoints: challenger.viewpoints,
    },
    challenger.archetype,
    challenger.aura,
    "defender",
  );

  return {
    challenger,
    defender,
    equipmentNotes: [
      player.cards[0]?.hint ?? "先立住主攻击角度，再展开其他火力。",
      player.cards[1]?.hint ?? "第二张卡最好拿来补第一张卡的短板。",
      player.cards[3]?.hint ?? "规则卡决定你想用什么方式换血。",
    ],
    matchUpCallout: createMatchUpCallout(player, defender),
    player,
    predictedEdges: [
      `你的主优势：${getPowerLabel(player.soul)}`,
      `守擂者主优势：${getPowerLabel(defender.soul)}`,
      createMatchUpCallout(player, defender),
    ],
    topic,
  };
};

type ExchangeResult = {
  defenderDamage: number;
  description: string;
  scoreDelta: number;
  tags: string[];
  title: string;
  weaknessHit: boolean;
};

const runExchange = (
  attacker: FighterProfile,
  defender: FighterProfile,
  card: BuildCard,
  round: number,
) => {
  const seed = hashToSeed(`${attacker.id}:${defender.id}:${card.id}:${round}`);
  const rng = createRng(seed);
  const attackPower =
    card.atk * 1.9 + attacker.soul.ferocity * 0.36 + attacker.soul.tempo * 0.18;
  const defensePower =
    defender.cards[Math.max(0, round - 1)]?.def * 1.4 +
    defender.soul.guard * 0.34 +
    defender.soul.resolve * 0.16;
  const penetrationPower =
    card.pen * 1.6 + attacker.soul.insight * 0.24 - defender.soul.guard * 0.14;
  const weaknessHit =
    penetrationPower > defensePower * 0.72 ||
    card.trait === "破甲反问" ||
    rng() > 0.84;
  const defenderDamage = clampInt(
    attackPower * 0.18 -
      defensePower * 0.08 +
      penetrationPower * 0.14 +
      (weaknessHit ? 7 : 0) +
      rng() * 4,
    5,
    24,
  );
  const scoreDelta = clampInt(
    defenderDamage * 0.72 + (weaknessHit ? 4 : 1) + rng() * 2,
    4,
    18,
  );

  return {
    defenderDamage,
    description: weaknessHit
      ? `${attacker.displayName} 用 ${card.title} 撕开了 ${defender.displayName} 的隐藏漏洞。`
      : `${attacker.displayName} 用 ${card.trait} 赢下了这一轮换血。`,
    scoreDelta,
    tags: weaknessHit ? ["弱点", "破甲"] : ["压制", "换血"],
    title: weaknessHit ? "命中弱点" : "压制换血",
    weaknessHit,
  } satisfies ExchangeResult;
};

const createJudgeBoard = (
  player: FighterProfile,
  defender: FighterProfile,
  playerScore: number,
  defenderScore: number,
) =>
  [
    {
      commentary:
        playerScore >= defenderScore
          ? `${player.displayName} 在高压下完成了更多闭环。`
          : `${defender.displayName} 在受击状态下守住了更完整的论证框架。`,
      defenderScore: clampInt(defenderScore * 0.46 + defender.soul.guard * 0.16, 18, 48),
      id: "logic-censor",
      playerScore: clampInt(playerScore * 0.46 + player.soul.insight * 0.16, 18, 48),
      title: "逻辑评委",
    },
    {
      commentary:
        average(player.cards.map((card) => card.radar.originality)) >=
        average(defender.cards.map((card) => card.radar.originality))
          ? `${player.displayName} 的构筑组合更锋利。`
          : `${defender.displayName} 的构筑纪律更完整。`,
      defenderScore: clampInt(
        average(defender.cards.map((card) => card.radar.originality)) * 0.18 +
          defender.soul.resolve * 0.2,
        14,
        42,
      ),
      id: "build-warden",
      playerScore: clampInt(
        average(player.cards.map((card) => card.radar.originality)) * 0.18 +
          player.soul.resolve * 0.2,
        14,
        42,
      ),
      title: "构筑评委",
    },
    {
      commentary:
        player.soul.tempo >= defender.soul.tempo
          ? `${player.displayName} 抢下了更多舞台高光。`
          : `${defender.displayName} 对擂台节奏的控制更强。`,
      defenderScore: clampInt(defenderScore * 0.2 + defender.soul.tempo * 0.12, 10, 34),
      id: "crowd-broker",
      playerScore: clampInt(playerScore * 0.2 + player.soul.tempo * 0.12, 10, 34),
      title: "观众热度",
    },
  ] satisfies JudgeVerdict[];

const buildHighlights = (events: BattleEvent[]) => {
  const scoredAttacks = events
    .filter((event) => event.type === "attack" || event.type === "weakness_hit")
    .map((event) => ({
      actorId: event.actorId ?? "player",
      damage: Math.abs(event.effect?.healthDelta ?? 0),
      description: event.description,
      title: event.title,
    }));
  const strongest = [...scoredAttacks].sort((a, b) => b.damage - a.damage)[0];
  const rebuttal =
    [...scoredAttacks]
      .filter((event) => event.title === "命中弱点")
      .sort((a, b) => b.damage - a.damage)[0] ?? strongest;
  const flaw =
    events.find((event) => event.type === "weakness_hit") ??
    events.find((event) => event.type === "defense") ??
    events[events.length - 1];

  return [
    {
      actorId: strongest?.actorId ?? "player",
      description: strongest?.description ?? "最强一击尚未生成。",
      id: "highlight-strongest-hit",
      label: "最强一击",
      title: strongest?.title ?? "终局重锤",
    },
    {
      actorId: rebuttal?.actorId ?? "defender",
      description: rebuttal?.description ?? "最佳反驳尚未生成。",
      id: "highlight-best-rebuttal",
      label: "最佳反驳",
      title: rebuttal?.title ?? "反制框架",
    },
    {
      actorId: flaw?.actorId ?? "defender",
      description: flaw?.description ?? "致命漏洞尚未生成。",
      id: "highlight-fatal-flaw",
      label: "致命漏洞",
      title: flaw?.title ?? "破防时刻",
    },
  ] satisfies BattleHighlight[];
};

const createNextChallengerPreview = (currentId: string) => {
  const challengerIndex = challengerPresets.findIndex(
    (challenger) => challenger.id === currentId,
  );
  const next =
    challengerPresets[(challengerIndex + 1) % challengerPresets.length] ??
    challengerPresets[0];
  const profile = toFighterProfile(
    "defender",
    {
      declaration: next.declaration,
      displayName: next.displayName,
      rule: next.rule,
      soulSeedTags: next.soulSeedTags,
      taboo: next.taboo,
      viewpoints: next.viewpoints,
    },
    next.archetype,
    next.aura,
    `preview-${next.id}`,
  );

  return {
    archetype: profile.archetype,
    aura: profile.aura,
    declaration: profile.declaration,
    displayName: profile.displayName,
    soul: profile.soul,
  };
};

const createBattlePackage = (setup: LegacyArenaBattleSetup): BattlePackage => {
  const preview = buildArenaPreview(setup);
  const player = preview.player;
  const defender = preview.defender;
  const battleId = randomUUID();
  const events: BattleEvent[] = [];
  let atMs = 0;
  let playerHealth = 100;
  let defenderHealth = 100;
  let playerScore = 0;
  let defenderScore = 0;

  const pushEvent = (event: Omit<BattleEvent, "id" | "index">) => {
    events.push({
      ...event,
      id: `${battleId}-event-${events.length}`,
      index: events.length,
    });
    atMs = event.atMs;
  };

  pushEvent({
    atMs,
    description: `${player.displayName} 带着 ${preview.player.powerLabel} 构筑登场，对阵 ${defender.displayName}。`,
    round: 0,
    title: preview.topic.title,
    type: "intro",
  });
  pushEvent({
    atMs: atMs + 1200,
    description: preview.matchUpCallout,
    round: 0,
    title: "构筑判读",
    type: "build_hint",
  });

  for (let round = 1; round <= 3; round += 1) {
    pushEvent({
      atMs: atMs + 1400,
      description: `第 ${round} 回合开始，战场围绕这个辩题展开：${preview.topic.prompt}`,
      round,
      title: `Round ${round}`,
      type: "round_start",
    });

    const playerCard = player.cards[(round - 1) % player.cards.length];
    const playerExchange = runExchange(player, defender, playerCard, round);
    defenderHealth = clampInt(defenderHealth - playerExchange.defenderDamage, 0, 100);
    playerScore += playerExchange.scoreDelta;
    pushEvent({
      actorId: player.id,
      atMs: atMs + 1250,
      description: playerExchange.description,
      effect: {
        healthDelta: -playerExchange.defenderDamage,
        scoreDelta: playerExchange.scoreDelta,
      },
      round,
      tags: playerExchange.tags,
      targetId: defender.id,
      title: playerExchange.title,
      type: playerExchange.weaknessHit ? "weakness_hit" : "attack",
    });

    defenderScore += 2;
    pushEvent({
      actorId: defender.id,
      atMs: atMs + 1050,
      description: `${defender.displayName} 稳住了局面，没有让对手滚起整轮雪球。`,
      effect: {
        scoreDelta: 2,
      },
      round,
      title: "稳住防线",
      type: "defense",
    });

    const defenderCard = defender.cards[(round + 1) % defender.cards.length];
    const defenderExchange = runExchange(defender, player, defenderCard, round);
    playerHealth = clampInt(playerHealth - defenderExchange.defenderDamage, 0, 100);
    defenderScore += defenderExchange.scoreDelta;
    pushEvent({
      actorId: defender.id,
      atMs: atMs + 1250,
      description: defenderExchange.description,
      effect: {
        healthDelta: -defenderExchange.defenderDamage,
        scoreDelta: defenderExchange.scoreDelta,
      },
      round,
      tags: defenderExchange.tags,
      targetId: player.id,
      title: defenderExchange.title,
      type: defenderExchange.weaknessHit ? "weakness_hit" : "attack",
    });

    pushEvent({
      atMs: atMs + 950,
      description: `${player.displayName} ${playerScore} : ${defenderScore} ${defender.displayName}`,
      round,
      title: "比分更新",
      type: "score_update",
    });
  }

  const judges = createJudgeBoard(player, defender, playerScore, defenderScore);
  const judgePlayer = judges.reduce((sum, judge) => sum + judge.playerScore, 0);
  const judgeDefender = judges.reduce((sum, judge) => sum + judge.defenderScore, 0);
  const crowdScore = {
    defender: clampInt(defenderScore * 0.44 + defender.soul.tempo * 0.08, 12, 34),
    player: clampInt(playerScore * 0.44 + player.soul.tempo * 0.08, 12, 34),
  };
  const finalScore = {
    defender: judgeDefender + crowdScore.defender,
    player: judgePlayer + crowdScore.player,
  };
  const winnerId =
    finalScore.player >= finalScore.defender ? player.id : defender.id;

  pushEvent({
    atMs: atMs + 1400,
    description:
      winnerId === player.id
        ? `${player.displayName} 依靠更锋利的解释型构筑拿下了这一局。`
        : `${defender.displayName} 凭借更稳的防守结构继续守擂。`,
    round: 4,
    title: "终局裁定",
    type: "match_end",
  });

  const challengerPreview = createNextChallengerPreview(setup.challengerId);
  pushEvent({
    actorId: winnerId,
    atMs: atMs + 1600,
    description: `${challengerPreview.displayName} 已经在台下亮相，下一场即将开始。`,
    round: 4,
    title: "下一位挑战者",
    type: "challenger_preview",
  });

  return {
    challengerPreview,
    classicLabel:
      winnerId === player.id ? "逆风破防局" : "控场守擂局",
    createdAt: new Date().toISOString(),
    crowdScore,
    defender: {
      ...defender,
      health: defenderHealth,
    },
    events,
    finalScore,
    highlights: buildHighlights(events),
    id: battleId,
    judges,
    participantRefs: [],
    player: {
      ...player,
      health: playerHealth,
    },
    roomTitle: `${preview.topic.title} · ${player.displayName} 对阵 ${defender.displayName}`,
    sourceMeta: {
      aiAssistEnabled: false,
      aiAssistUsed: false,
      generationMode: "mock",
      issues: [],
    },
    topic: preview.topic,
    winnerId,
  } satisfies BattlePackage;
};

export const getClassicBattlePackages = () => {
  const classics: BattlePackage[] = [];

  for (let index = 0; index < 3; index += 1) {
    const challenger = challengerPresets[index % challengerPresets.length];
    const topic = topicPresets[index % topicPresets.length];
    const pack = createBattlePackage({
      challengerId: challenger.id,
      player: {
        declaration: "我只接受能经得起连续反驳的胜利。",
        displayName:
          ["魂匠", "节奏学者", "野性信号"][index] ?? "魂匠",
        rule: [
          "任何核心主张都必须落到一个可执行结果上。",
          "先抢节奏，再补反证。",
          "把隐藏前提拖到台前。",
        ][index] ?? "任何核心主张都必须落到一个可执行结果上。",
        soulSeedTags: ["Soul", "Arena", "Build", `经典战役-${index + 1}`],
        taboo: [
          "禁止用口号替代结构。",
          "禁止把节奏耗死在空转里。",
          "禁止把复读当成证明。",
        ][index] ?? "禁止用口号替代结构。",
        viewpoints: [
          "最强的构筑不是最响亮的构筑，而是能在反击中继续站住的构筑。",
          "传播速度会改变观点在擂台上的生存力。",
          "最危险的辩手，是那个能随时切换节奏的人。",
        ],
      },
      topicId: topic.id,
    });

    classics.push({
      ...pack,
      id: `classic-${index + 1}`,
    });
  }

  return classics;
};
