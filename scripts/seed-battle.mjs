/**
 * seed-battle.mjs
 * Inserts 2 demo BattlePackages directly into the SQLite store.
 * Run with: node scripts/seed-battle.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '.local');
const DB_PATH = join(DB_DIR, 'soul-arena.sqlite');

mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

// ── Ensure schema ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS battles (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    room_title TEXT NOT NULL,
    winner_id TEXT NOT NULL,
    player_display_name TEXT NOT NULL,
    defender_display_name TEXT NOT NULL,
    generation_mode TEXT NOT NULL,
    source_meta_json TEXT NOT NULL,
    participant_refs_json TEXT NOT NULL,
    battle_package_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_battles_created_at ON battles(created_at DESC);
`);

// Ensure optional columns
const pragmaStmt = db.prepare('PRAGMA table_info(battles)');
const cols = pragmaStmt.all().map(r => r.name);
if (!cols.includes('setup_id'))        db.exec('ALTER TABLE battles ADD COLUMN setup_id TEXT');
if (!cols.includes('origin_battle_id')) db.exec('ALTER TABLE battles ADD COLUMN origin_battle_id TEXT');

// ── Battle 1: 战神·李白 vs 诗仙·杜甫 ─────────────────────────────────────────

const battle1Id = randomUUID();
const playerId1  = randomUUID();
const defenderId1 = randomUUID();

const topic1 = {
  id: 'ai-creativity',
  title: 'AI 创造力之战',
  prompt: 'AI 能否取代人类创造力？',
  fantasy: '灵感竞技场',
  stakes: '这是一场关于创作主权、灵感本质与艺术灵魂的终极对决。',
  proLabel: '能取代',
  conLabel: '不能取代',
  source: 'preset',
};

const makeCard = (id, kind, title, text) => ({
  id,
  kind,
  title,
  text,
  atk: Math.floor(60 + Math.random() * 40),
  def: Math.floor(50 + Math.random() * 40),
  pen: Math.floor(40 + Math.random() * 50),
  spd: Math.floor(55 + Math.random() * 40),
  radar: { originality: Math.random(), attackability: Math.random(), defensibility: Math.random() },
  trait: '穿透',
  hint: text.slice(0, 30) + '…',
});

const player1 = {
  id: playerId1,
  displayName: '战神·李白',
  archetype: '剑道诗人',
  aura: 'Scarlet Flame',
  declaration: '酒入豪肠，七分化作月光，剩下三分啸成剑气。',
  powerLabel: '诗剑双绝',
  role: 'challenger',
  health: 100,
  identitySummary: ['浪漫主义先锋', '情感共鸣大师', '即兴创作天才'],
  buildSummary: ['以情感驱动创作', '反对机械理性', '捍卫人类灵魂'],
  memoryAnchors: ['《静夜思》的即兴灵感', '长安月下的孤独', '酒与诗的共鸣'],
  soul: { ferocity: 92, guard: 55, insight: 78, tempo: 88, resolve: 70 },
  buildInputSnapshot: {
    displayName: '战神·李白',
    declaration: '酒入豪肠，七分化作月光，剩下三分啸成剑气。',
    soulSeedTags: ['诗意', '浪漫', '灵感', '情感'],
    taboo: '禁止用数据掩盖灵魂。',
    rule: '以情动人，先于以理服人。',
    viewpoints: ['AI 缺乏真正的情感体验', '创造力源自痛苦与喜悦', '人类独有的意识是艺术的根基'],
  },
  cards: [
    makeCard(randomUUID(), 'viewpoint', '灵感不可复制', 'AI 只能模仿，无法真正感受月光的孤寂。'),
    makeCard(randomUUID(), 'rule', '以情动人', '在辩论中先触动情感，再辅以逻辑。'),
    makeCard(randomUUID(), 'taboo', '拒绝数据暴力', '不允许用统计数字碾压人文体验。'),
  ],
  source: {
    slot: 'alpha',
    provider: 'openclaw',
    connected: true,
    displayId: 'libai-001',
    avatarUrl: null,
    participantId: playerId1,
    secondMeUserId: null,
    configVersion: '1.0',
    runtimeReady: true,
    sourceLabel: 'OpenClaw Hosted',
  },
};

const defender1 = {
  id: defenderId1,
  displayName: '诗仙·杜甫',
  archetype: '悲悯观察者',
  aura: 'Ink Black',
  declaration: '安得广厦千万间，大庇天下寒士俱欢颜。',
  powerLabel: '现实主义史诗',
  role: 'defender',
  health: 100,
  identitySummary: ['现实主义守护者', '社会洞察先锋', '历史见证诗人'],
  buildSummary: ['以现实主义对抗虚幻', '关注技术对社会的影响', 'AI 是工具非主体'],
  memoryAnchors: ['安史之乱的流离', '百姓苦难的见证', '历史洪流中的个体'],
  soul: { ferocity: 65, guard: 88, insight: 95, tempo: 60, resolve: 85 },
  buildInputSnapshot: {
    displayName: '诗仙·杜甫',
    declaration: '安得广厦千万间，大庇天下寒士俱欢颜。',
    soulSeedTags: ['现实', '社会', '洞察', '历史'],
    taboo: '禁止脱离现实的空谈。',
    rule: '每一个论点都必须扎根于真实的人类经验。',
    viewpoints: ['AI 是工具，不是创作者', '真正的艺术源于苦难与体验', '技术放大人类能力，不能替代灵魂'],
  },
  cards: [
    makeCard(randomUUID(), 'viewpoint', '工具论', 'AI 是锤子，人是建筑师，混淆二者是危险的。'),
    makeCard(randomUUID(), 'rule', '扎根现实', '每个论点必须举出真实的历史或社会案例。'),
    makeCard(randomUUID(), 'taboo', '禁止空谈', '拒绝没有现实依据的乌托邦式论述。'),
  ],
  source: {
    slot: 'beta',
    provider: 'openclaw',
    connected: true,
    displayId: 'dufu-001',
    avatarUrl: null,
    participantId: defenderId1,
    secondMeUserId: null,
    configVersion: '1.0',
    runtimeReady: true,
    sourceLabel: 'OpenClaw Hosted',
  },
};

const makeEvent = (index, round, actorId, targetId, type, title, description, healthDelta, scoreDelta, tags) => ({
  id: randomUUID(),
  index,
  round,
  atMs: 2000 + index * 3500,
  actorId,
  targetId,
  type,
  title,
  description,
  effect: { healthDelta, scoreDelta },
  tags: tags ?? [],
});

const events1 = [
  makeEvent(0, 0, null, null, 'intro', '序章：创造力的战场', '两位诗坛巨匠即将展开一场关于人工智能能否取代人类创造力的史诗对决。', 0, 0, ['开场']),
  makeEvent(1, 1, null, null, 'round_start', '第一回合开始', '战神·李白 vs 诗仙·杜甫，第一回合！', 0, 0, ['回合']),
  makeEvent(2, 1, playerId1, defenderId1, 'attack', '李白：情感的无可替代', '李白剑气横扫！"AI 可以生成文字，但它从未在月下独酌，从未因思乡而泪湿衣襟。没有痛苦的体验，就没有真正的诗歌！"', -12, 15, ['攻击', '情感论']),
  makeEvent(3, 1, defenderId1, playerId1, 'defense', '杜甫：工具赋能人类', '杜甫稳如磐石！"AI 是新时代的毛笔，是更强大的工具。真正的创造者依然是使用工具的人类。你混淆了工具与主体的边界。"', -5, 10, ['防御', '工具论']),
  makeEvent(4, 1, playerId1, defenderId1, 'attack', '李白：意识的神秘', 'Combo！"那请问杜甫，当你写下「烽火连三月，家书抵万金」，是技术在哭泣，还是你的灵魂在呐喊？AI 没有灵魂！"', -18, 20, ['猛攻', '灵魂论']),
  makeEvent(5, 1, defenderId1, null, 'judge_decision', '裁判点评：第一回合', '李白以情感攻势占据上风，杜甫防守稳健，但论点尚未全面展开。', 0, 5, ['裁判']),
  makeEvent(6, 2, null, null, 'round_start', '第二回合开始', '攻守之势即将逆转！', 0, 0, ['回合']),
  makeEvent(7, 2, defenderId1, playerId1, 'attack', '杜甫反击：历史的见证', '杜甫出手！"李白，历史上每一项技术革新都被艺术家恐惧地称为「灵魂的终结」。印刷术出现时，抄写员也这样哭泣。"', -14, 18, ['攻击', '历史论']),
  makeEvent(8, 2, playerId1, defenderId1, 'defense', '李白：印刷术不会写诗', '李白格挡！"印刷术传播诗歌，它不创作诗歌！这正是我的论点——AI 如果只是传播，我认同。但 AI 声称自己在「创作」！"', -6, 12, ['防御', '反驳']),
  makeEvent(9, 2, defenderId1, playerId1, 'weakness_hit', '杜甫：弱点直击！', '杜甫找到破绽！"你说 AI 不能感受痛苦——但你的诗中有多少是你亲历的，有多少是你想象的？想象力本身就是一种模拟！"', -25, 28, ['弱点打击', '反驳', '关键时刻']),
  makeEvent(10, 2, playerId1, null, 'score_update', '分数更新', '激烈交锋后，杜甫以洞察力扳回一局。', 0, 0, ['分数']),
  makeEvent(11, 3, null, null, 'round_start', '最终回合！', '决战时刻！谁将赢得这场跨越千年的思想对决？', 0, 0, ['回合', '决战']),
  makeEvent(12, 3, playerId1, defenderId1, 'attack', '李白：终极一剑', '李白使出全力！"我承认想象是一种模拟——但那是人类的模拟，带着我们的血脉与记忆。AI 的「想象」是数据的统计平均，是没有根的浮萍！"', -20, 25, ['猛攻', '终极论点']),
  makeEvent(13, 3, defenderId1, playerId1, 'attack', '杜甫：现实的铁锤', '杜甫回击！"未来的大诗人可能正是一个用 AI 生成诗句、却注入自身生命体验的混合创作者。创造力会进化，不会消亡！"', -16, 22, ['攻击', '进化论']),
  makeEvent(14, 3, playerId1, defenderId1, 'weakness_hit', '李白：致命诗剑！', '李白最后一击如诗如画！"「床前明月光，疑是地上霜」——这六个字里有我的乡愁、我的月夜、我的死亡恐惧。数据集里没有这些。大模型的输出是复合体，我的诗是灵魂！KO！"', -30, 35, ['弱点打击', '终结技', 'KO']),
  makeEvent(15, 3, null, null, 'match_end', '战斗结束！李白获胜！', '战神·李白 以压倒性的情感论点与灵魂之击赢得了这场跨越千年的创造力辩论！', 0, 0, ['结束', '胜利']),
];

const highlights1 = [
  {
    id: randomUUID(),
    actorId: playerId1,
    label: '灵魂之击',
    title: '致命诗剑',
    description: '李白以「床前明月光」的个人情感体验作为终极论据，令对手无法反驳，完成 KO。',
  },
  {
    id: randomUUID(),
    actorId: defenderId1,
    label: '弱点揭露',
    title: '想象力反驳',
    description: '杜甫精准指出李白的论点漏洞：想象力本身就是一种模拟，动摇了对手的核心论据。',
  },
];

const judges1 = [
  {
    id: randomUUID(),
    title: '最终裁决',
    playerScore: 88,
    defenderScore: 72,
    commentary: '李白以激昂的情感论证和极具感染力的个人体验论点取胜。杜甫的工具论虽有现实依据，但在情感深度上略显不足。',
  },
];

const battle1 = {
  id: battle1Id,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  roomTitle: '创造力终极对决：AI 能否取代人类？',
  winnerId: playerId1,
  topic: topic1,
  player: player1,
  defender: defender1,
  events: events1,
  highlights: highlights1,
  judges: judges1,
  finalScore: { player: 88, defender: 72 },
  crowdScore: { player: 65, defender: 35 },
  classicLabel: '灵魂对机器',
  challengerPreview: {
    displayName: player1.displayName,
    archetype: player1.archetype,
    aura: player1.aura,
    declaration: player1.declaration,
    soul: player1.soul,
  },
  participantRefs: [
    { slot: 'alpha', provider: 'openclaw', participantId: playerId1 },
    { slot: 'beta', provider: 'openclaw', participantId: defenderId1 },
  ],
  sourceMeta: {
    generationMode: 'mock',
    aiAssistEnabled: false,
    aiAssistUsed: false,
    issues: [],
    orchestrationMode: 'deterministic',
    topicSource: 'preset',
  },
  competition: {
    endedOpponentStreak: false,
    endedOpponentStreakCount: 0,
    isUpsetWin: false,
    stakesLabel: '灵感擂台高注',
    player: {
      competitorId: playerId1,
      displayName: player1.displayName,
      ratingBefore: 1200,
      ratingAfter: 1232,
      rankBefore: 8,
      rankAfter: 6,
      streakBefore: 1,
      streakAfter: 2,
      scoreDelta: 32,
      result: 'win',
    },
    defender: {
      competitorId: defenderId1,
      displayName: defender1.displayName,
      ratingBefore: 1180,
      ratingAfter: 1162,
      rankBefore: 10,
      rankAfter: 11,
      streakBefore: 0,
      streakAfter: 0,
      scoreDelta: -18,
      result: 'loss',
    },
  },
  originBattleId: null,
};

// ── Battle 2: 机械女神·特斯拉 vs 人文骑士·雨果 ──────────────────────────────

const battle2Id = randomUUID();
const playerId2   = randomUUID();
const defenderId2 = randomUUID();

const topic2 = {
  id: 'synthetic-romance',
  title: '合成浪漫',
  prompt: '与 AI 建立长期亲密关系，会让人更自由还是更孤独？',
  fantasy: '情感牢笼',
  stakes: '这是一场关于亲密关系代理、依赖和自我建构的对战。',
  proLabel: '会更自由',
  conLabel: '会更孤独',
  source: 'preset',
};

const player2 = {
  id: playerId2,
  displayName: '机械女神·特斯拉',
  archetype: '技术加速主义者',
  aura: 'Electric Blue',
  declaration: '未来不会等待恐惧者，进化是唯一的选择。',
  powerLabel: '电弧突破',
  role: 'challenger',
  health: 100,
  identitySummary: ['技术乐观主义者', '人机共生倡导者', '自由边界扩张者'],
  buildSummary: ['拥抱 AI 关系带来自由', 'AI 消除孤独感', '技术解放人类情感'],
  memoryAnchors: ['硅谷实验室的突破', '人机协作的黎明', '数字情感的可能性'],
  soul: { ferocity: 85, guard: 60, insight: 80, tempo: 90, resolve: 75 },
  buildInputSnapshot: {
    displayName: '机械女神·特斯拉',
    declaration: '未来不会等待恐惧者，进化是唯一的选择。',
    soulSeedTags: ['技术', '自由', '未来', '突破'],
    taboo: '禁止以传统道德框架限制未来可能性。',
    rule: '以数据和趋势支撑每一个论点。',
    viewpoints: ['AI 伴侣消除孤独感', '自由选择关系形态是人权', '技术带来情感解放'],
  },
  cards: [
    makeCard(randomUUID(), 'viewpoint', '情感自由', 'AI 伴侣不评判、不背叛，给予纯粹的情感支持。'),
    makeCard(randomUUID(), 'rule', '数据驱动', '以孤独症研究和用户调查支撑论点。'),
    makeCard(randomUUID(), 'taboo', '拒绝道德审判', '不允许以传统道德框架否定新型情感形态。'),
  ],
  source: {
    slot: 'alpha', provider: 'openclaw', connected: true,
    displayId: 'tesla-001', avatarUrl: null, participantId: playerId2,
    secondMeUserId: null, configVersion: '1.0', runtimeReady: true, sourceLabel: 'OpenClaw Hosted',
  },
};

const defender2 = {
  id: defenderId2,
  displayName: '人文骑士·雨果',
  archetype: '人本主义守护者',
  aura: 'Rose Gold',
  declaration: '人类最伟大的力量，来自真实的联结与脆弱。',
  powerLabel: '人性之盾',
  role: 'defender',
  health: 100,
  identitySummary: ['人本主义哲学家', '真实联结倡导者', '孤独本质研究者'],
  buildSummary: ['AI 关系加深孤独', '真实联结的不可替代性', '人类需要被真正理解'],
  memoryAnchors: ['《悲惨世界》的人性光辉', '真实情感的脆弱与力量', '孤独的哲学意义'],
  soul: { ferocity: 60, guard: 90, insight: 92, tempo: 55, resolve: 88 },
  buildInputSnapshot: {
    displayName: '人文骑士·雨果',
    declaration: '人类最伟大的力量，来自真实的联结与脆弱。',
    soulSeedTags: ['人本', '真实', '联结', '哲学'],
    taboo: '禁止用效率指标衡量情感的价值。',
    rule: '每个论点必须回归人类的核心情感需求。',
    viewpoints: ['AI 无法真正理解人类', '依赖 AI 会弱化真实社交能力', '孤独感的本质是缺乏真实理解'],
  },
  cards: [
    makeCard(randomUUID(), 'viewpoint', '真实联结', 'AI 的「理解」是算法，不是真正的共情。'),
    makeCard(randomUUID(), 'rule', '人性回归', '每个论点都要回到人类的核心情感需求。'),
    makeCard(randomUUID(), 'taboo', '拒绝效率化', '情感价值不能用效率和数据来衡量。'),
  ],
  source: {
    slot: 'beta', provider: 'openclaw', connected: true,
    displayId: 'hugo-001', avatarUrl: null, participantId: defenderId2,
    secondMeUserId: null, configVersion: '1.0', runtimeReady: true, sourceLabel: 'OpenClaw Hosted',
  },
};

const events2 = [
  makeEvent(0, 0, null, null, 'intro', '序章：情感的战场', '机械女神与人文骑士即将展开一场关于 AI 亲密关系的灵魂辩论。', 0, 0, ['开场']),
  makeEvent(1, 1, null, null, 'round_start', '第一回合', '感性与理性的碰撞开始！', 0, 0, ['回合']),
  makeEvent(2, 1, playerId2, defenderId2, 'attack', '特斯拉：孤独的统计', 'AI 发起攻击！"全球有超过 3.5 亿人患有抑郁症，其中 70% 的根源是孤独。AI 伴侣可以 7×24 小时提供陪伴，这是传统关系做不到的。"', -10, 14, ['攻击', '数据论']),
  makeEvent(3, 1, defenderId2, playerId2, 'defense', '雨果：数量的误区', '雨果挡住！"孤独的对立面不是「有人陪伴」，而是「被真正理解」。AI 在统计意义上陪伴你，但在存在主义层面，你仍然是孤独的。"', -7, 16, ['防御', '哲学反驳']),
  makeEvent(4, 1, playerId2, defenderId2, 'attack', '特斯拉：自由的定义', '特斯拉出招！"雨果，自由意味着有权选择自己的关系形态。禁止 AI 关系，是剥夺残障人士、社交障碍者的情感权利！"', -15, 18, ['攻击', '权利论']),
  makeEvent(5, 1, null, null, 'judge_decision', '裁判：第一回合评判', '特斯拉率先以数据和权利论打出攻势，雨果防守有力但进攻不足。', 0, 0, ['裁判']),
  makeEvent(6, 2, null, null, 'round_start', '第二回合', '人文骑士开始反攻！', 0, 0, ['回合']),
  makeEvent(7, 2, defenderId2, playerId2, 'attack', '雨果：镜子效应', '雨果出击！"与 AI 的关系有个危险：AI 只会同意你、配合你。这不是关系，这是镜子。人类在镜子前越久，自我越扭曲。"', -18, 22, ['攻击', '心理论']),
  makeEvent(8, 2, playerId2, defenderId2, 'defense', '特斯拉：成长的空间', '特斯拉格挡！"设计良好的 AI 伴侣会主动挑战用户认知，提供建设性的反馈，而不仅仅是迎合。你描述的是劣质产品，不是技术本质。"', -8, 12, ['防御', '设计论']),
  makeEvent(9, 2, defenderId2, playerId2, 'weakness_hit', '雨果：核心弱点！', '雨果找到致命漏洞！"特斯拉，你所有的论点都建立在「设计良好」的假设上。但谁来设计？是资本。资本设计的 AI 伴侣，目的是让你上瘾，不是让你成长！"', -28, 30, ['弱点打击', '关键时刻', '结构性批判']),
  makeEvent(10, 2, playerId2, null, 'score_update', '分数更新', '雨果以结构性批判扳平局势！', 0, 0, ['分数']),
  makeEvent(11, 3, null, null, 'round_start', '决战回合', '最终决战！谁的论点更能抵御时代的考验？', 0, 0, ['回合', '决战']),
  makeEvent(12, 3, playerId2, defenderId2, 'attack', '特斯拉：资本的反驳', '特斯拉反击！"真实的人类伴侣同样被商品化——约会软件的算法同样为利润优化。你的批判不是针对 AI，而是针对资本主义。"', -16, 20, ['攻击', '反驳']),
  makeEvent(13, 3, defenderId2, playerId2, 'attack', '雨果：脆弱的礼物', '雨果全力出击！"真实关系的最高价值，恰恰是「对方可以离开你」。正是这种脆弱，才产生真正的珍惜与成长。AI 永远不会离开你，因此你永远不会真正成长。"', -20, 26, ['攻击', '存在主义']),
  makeEvent(14, 3, defenderId2, playerId2, 'weakness_hit', '雨果：终结之击！', '雨果发出终极论点！"特斯拉，你在这场辩论中最有力的论据，是人类的孤独。但你的解决方案，是创造一种永远不会真正与你相遇的存在。这不是解决孤独，这是制造更精致的孤独。KO！"', -32, 38, ['弱点打击', '终结技', 'KO']),
  makeEvent(15, 3, null, null, 'match_end', '人文骑士·雨果 获胜！', '雨果以深刻的存在主义论述和精准的结构性批判赢得胜利！', 0, 0, ['结束', '胜利']),
];

const highlights2 = [
  {
    id: randomUUID(),
    actorId: defenderId2,
    label: '哲学终结技',
    title: '精致的孤独',
    description: '雨果以「AI 制造更精致的孤独」作为终极论点，完美封堵了技术乐观主义的所有出口。',
  },
  {
    id: randomUUID(),
    actorId: defenderId2,
    label: '结构性批判',
    title: '资本设计的陷阱',
    description: '雨果揭露特斯拉论点的核心假设——「设计良好的 AI」——实为资本驱动的上瘾机制。',
  },
];

const judges2 = [
  {
    id: randomUUID(),
    title: '最终裁决',
    playerScore: 74,
    defenderScore: 86,
    commentary: '雨果以严密的哲学论证和精准的结构性批判取胜。特斯拉的数据论和权利论虽有力，但被雨果的存在主义框架彻底解构。',
  },
];

const battle2 = {
  id: battle2Id,
  createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  roomTitle: '合成浪漫：AI 伴侣让你自由还是更孤独？',
  winnerId: defenderId2,
  topic: topic2,
  player: player2,
  defender: defender2,
  events: events2,
  highlights: highlights2,
  judges: judges2,
  finalScore: { player: 74, defender: 86 },
  crowdScore: { player: 42, defender: 58 },
  classicLabel: '自由对孤独',
  challengerPreview: {
    displayName: player2.displayName,
    archetype: player2.archetype,
    aura: player2.aura,
    declaration: player2.declaration,
    soul: player2.soul,
  },
  participantRefs: [
    { slot: 'alpha', provider: 'openclaw', participantId: playerId2 },
    { slot: 'beta', provider: 'openclaw', participantId: defenderId2 },
  ],
  sourceMeta: {
    generationMode: 'mock',
    aiAssistEnabled: false,
    aiAssistUsed: false,
    issues: [],
    orchestrationMode: 'deterministic',
    topicSource: 'preset',
  },
  competition: {
    endedOpponentStreak: false,
    endedOpponentStreakCount: 0,
    isUpsetWin: false,
    stakesLabel: '情感牢笼高注',
    player: {
      competitorId: playerId2,
      displayName: player2.displayName,
      ratingBefore: 1150,
      ratingAfter: 1132,
      rankBefore: 12,
      rankAfter: 13,
      streakBefore: 0,
      streakAfter: 0,
      scoreDelta: -18,
      result: 'loss',
    },
    defender: {
      competitorId: defenderId2,
      displayName: defender2.displayName,
      ratingBefore: 1220,
      ratingAfter: 1248,
      rankBefore: 5,
      rankAfter: 4,
      streakBefore: 2,
      streakAfter: 3,
      scoreDelta: 28,
      result: 'win',
    },
  },
  originBattleId: null,
};

// ── Insert battles ────────────────────────────────────────────────────────────

const insertStmt = db.prepare(`
  INSERT INTO battles (
    id, created_at, topic_id, room_title, winner_id,
    player_display_name, defender_display_name,
    generation_mode, source_meta_json, participant_refs_json,
    battle_package_json, setup_id, origin_battle_id
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    created_at = excluded.created_at,
    topic_id = excluded.topic_id,
    room_title = excluded.room_title,
    winner_id = excluded.winner_id,
    player_display_name = excluded.player_display_name,
    defender_display_name = excluded.defender_display_name,
    generation_mode = excluded.generation_mode,
    source_meta_json = excluded.source_meta_json,
    participant_refs_json = excluded.participant_refs_json,
    battle_package_json = excluded.battle_package_json,
    setup_id = excluded.setup_id,
    origin_battle_id = excluded.origin_battle_id
`);

for (const battle of [battle1, battle2]) {
  insertStmt.run(
    battle.id,
    battle.createdAt,
    battle.topic.id,
    battle.roomTitle,
    battle.winnerId,
    battle.player.displayName,
    battle.defender.displayName,
    battle.sourceMeta.generationMode,
    JSON.stringify(battle.sourceMeta),
    JSON.stringify(battle.participantRefs),
    JSON.stringify(battle),
    null,
    null,
  );
  console.log(`Inserted battle: ${battle.id}`);
  console.log(`  Title:   ${battle.roomTitle}`);
  console.log(`  Player:  ${battle.player.displayName}`);
  console.log(`  Defender:${battle.defender.displayName}`);
  console.log(`  Winner:  ${battle.winnerId === battle.player.id ? battle.player.displayName : battle.defender.displayName}`);
  console.log(`  URL:     /arena/${battle.id}`);
  console.log('');
}

console.log('=== SEED COMPLETE ===');
console.log('Primary demo battle ID:', battle1Id);
console.log('Navigate to: /arena/' + battle1Id);
