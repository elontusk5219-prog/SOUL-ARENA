# API Contracts

## Status legend
- `implemented`: live in the current repo
- `legacy/mock`: still used for classic demo data
- `next`: reserved for the next integration pass

## Auth and participant APIs
- `GET /api/auth/login?slot=alpha|beta&returnTo=/arena`
  - `implemented`
  - Starts SecondMe OAuth for the requested participant slot.

- `GET /api/auth/callback`
  - `implemented`
  - Exchanges code for the slot-specific session and redirects back to `/arena`.

- `POST /api/auth/logout?slot=alpha|beta`
  - `implemented`
  - Clears one slot, or all slots when no slot is provided.

- `POST /api/auth/secondme/connect`
  - `implemented`
  - Returns `{ authUrl, slot }` for clients that want to trigger OAuth via JSON.

- `GET /api/participants`
  - `implemented`
  - Returns `{ participants }`.
  - Each participant includes:
    - `slot`
    - `provider`
    - `connected`
    - `displayName`
    - `secondMeUserId`
    - `session`
    - `user`
    - `shades`
    - `softMemory`
    - `issues`
  - Notes:
    - if `alpha` and `beta` resolve to the same `secondMeUserId`, both participants return warning text in `issues`
    - duplicate identity is a warning, not a hard error

- `DELETE /api/participants?slot=alpha|beta`
  - `implemented`
  - Disconnects a single slot.

## SecondMe proxy APIs
- `GET /api/me`
  - `implemented`
  - Compatibility endpoint for the primary slot (`alpha`).

- `POST /api/secondme/chat`
  - `implemented`
  - Proxies the primary slot chat stream.

- `POST /api/secondme/note`
  - `implemented`
  - Proxies note creation for the primary slot.

- `GET /api/secondme/shades`
  - `implemented`
  - Proxies shades for the primary slot.

- `GET /api/secondme/softmemory`
  - `implemented`
  - Proxies soft memory for the primary slot.

- `POST /api/secondme/agent-memory`
  - `implemented`
  - Request body:
    - `slot`
    - `event`
  - Proxies `agent_memory/ingest` for the requested slot.

## Arena APIs
- `GET /api/arena/topics`
  - `implemented`
  - Returns:
    - `topics`
    - `challengers`
    - `signals`
  - `challengers` now mainly support the classic home-page demo flow.

- `POST /api/arena/build-preview`
  - `implemented`
  - Request body:
    - `topicId`
    - `participants`
      - `{ slot, provider, participantId? }[]`
    - `overrides?`
      - keyed by `alpha` / `beta`
      - partial `FighterBuildInput`
  - Behavior:
    - requires both requested participants to be connected
    - assembles real fighter profiles from `user info + shades + soft memory`
    - if both participants are actually the same `SecondMe` account, preview still succeeds and returns warning text in `sourceMeta.issues`
  - Response includes:
    - `topic`
    - `player`
    - `defender`
    - `equipmentNotes`
    - `matchUpCallout`
    - `predictedEdges`
    - `participantRefs`
    - `sourceMeta`

- `POST /api/arena/battles`
  - `implemented`
  - Request body matches `build-preview`.
  - Behavior:
    - requires both requested participants to be connected
    - generates a hybrid battle package from the two real participant profiles
    - each round includes fighter-side move generation plus judge-side aggregation
    - best-effort writes battle outcome back to SecondMe agent memory for both slots
    - if both participants are actually the same `SecondMe` account, battle still succeeds and returns warning text in `sourceMeta.issues`
  - Response includes:
    - classic `battle package` fields used by replay
    - `participantRefs`
    - `sourceMeta`

- `GET /api/arena/history`
  - `implemented`
  - Query:
    - `limit?`
  - Returns:
    - `battles`
      - `id`
      - `createdAt`
      - `roomTitle`
      - `topicId`
      - `playerDisplayName`
      - `defenderDisplayName`
      - `winnerId`
      - `generationMode`

- `GET /api/arena/battles/:battleId`
  - `implemented`
  - Reads one battle package from the local SQLite battle store.

- `GET /api/arena/battles/:battleId/events`
  - `implemented`
  - Returns `{ battleId, events }`.

## Battle package notes
- Replay consumers should continue using:
  - `topic`
  - `player`
  - `defender`
  - `events`
  - `highlights`
  - `judges`
  - `finalScore`
  - `crowdScore`
  - `winnerId`

- New metadata added for real integrations:
  - `participantRefs`
  - `sourceMeta`
    - `generationMode`
    - `aiAssistEnabled`
    - `aiAssistUsed`
    - `orchestrationMode`
    - `issues`

- Current replay event stream may include:
  - `attack`
  - `defense`
  - `weakness_hit`
  - `judge_decision`
  - `score_update`

## Remaining gaps
- `openclaw` provider is typed but not implemented.
- Persistence is local SQLite only; there is no remote/shared store yet.
- The home page still uses classic demo battles generated from local presets.
## 2026-03-18 竞技化补充

### `GET /api/arena/leaderboard`
- 返回：
  - `featured`: 当前竞技焦点选手，可为空
  - `leaderboard`: 排行榜条目数组
- 条目包含：
  - `rank`
  - `rating`
  - `wins` / `losses`
  - `currentStreak` / `bestStreak`
  - `recentForm`
  - `suggestion`

### `GET /api/arena/profile`
- 查询方式一：`?competitorId=...`
  - 返回指定选手的竞技档案
- 查询方式二：`?slot=alpha&slot=beta`
  - 返回当前已连接槽位对应的竞技档案

### `BattlePackage.competition`
- 回放与结算使用的竞技字段
- 包含：
  - `stakesLabel`
  - `isUpsetWin`
  - `endedOpponentStreak`
  - `endedOpponentStreakCount`
  - `player`
  - `defender`

### `BattleSummary.competition`
- 历史战报列表使用的轻量结算字段
- 保持与 `BattlePackage.competition` 一致，但只用于列表摘要展示
## 2026-03-18 P0 主线补充

### `POST /api/openclaw/connect`
- 请求体：
  - `slot`
- 行为：
  - 读取 `~/.openclaw/workspace/soul.md`（或 `OPENCLAW_WORKSPACE_DIR/soul.md`）
  - 解析 markdown 并保存该槽位的 openclaw persona 配置快照
  - 把该槽位的 active provider 切换到 `openclaw`
- 备注：
  - 该接口现在仅作为 legacy/import fallback 保留，不再是默认主流程

### `POST /api/openclaw/bind-code`
- 请求体：
  - `slot`
- 返回：
  - `bindCode`
  - `expiresAt`
  - `registerUrl`
- 行为：
  - 为当前浏览器 session 的指定槽位生成一次性绑定码
  - 同时把该槽位 active provider 切换到 `openclaw`

### `POST /api/openclaw/register`
- 请求体：
  - `bindCode`
  - `displayName`
  - `declaration`
  - `rule`
  - `taboo`
  - `viewpoints`
  - 可选：
    - `displayId`
    - `avatarUrl`
    - `agentVersion`
    - `tags`
    - `memoryAnchors`
    - `soulSeedTags`
    - `archetype`
    - `aura`
    - `sourceLabel`
- 行为：
  - OpenClaw skill 通过绑定码完成远程注册
  - 服务端保存 binding snapshot 并返回 participant 摘要

### `GET /api/openclaw/profile`
- 查询参数：
  - `slot`
  - 可选 `participantId`
- 返回指定槽位当前或指定版本的 openclaw persona 摘要
- builder 用它轮询 OpenClaw 注册是否已完成

### `POST /api/participants`
- 请求体：
  - `slot`
  - `provider`
- 行为：
  - 切换某个槽位当前使用的 provider

### `POST /api/arena/rematch`
- 请求体：
  - `battleId`
- 行为：
  - 从 battle 派生一个新的 setup 模板
  - 返回 `setup`

### `GET /api/arena/setups/[setupId]`
- 返回：
  - `setup`
  - `participants`
- 用于 builder 回填 rematch 模板

### `GET /api/arena/topics`
- 现在返回两类题目：
  - `preset`
  - `zhihu_dynamic`
- `TopicPreset` 现在携带：
  - `source`
  - 可选 `sourceMeta`

### `POST /api/arena/build-preview`
- 支持 mixed provider 输入
- 支持：
  - `topicSnapshot`
  - `overrides`
  - `originBattleId`

### `POST /api/arena/battles`
- 创建 battle 前先保存 setup
- battle 现在会写入：
  - `setupId`
  - `originBattleId`
  - `sourceMeta.participantSnapshots`
