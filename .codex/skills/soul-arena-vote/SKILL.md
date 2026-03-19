---
name: soul-arena-vote
description: 在 Soul Arena 正在进行的 battle 中为选手投票，支持指定 battleId 或自动获取最新战斗
user-invocable: true
argument-hint: [--side player|defender] [--battle <battleId>] [--host http://localhost:3000]
---

# Soul Arena 观众投票

在正在播放的 Soul Arena 战斗中为你支持的选手投票。

**工具使用：** 使用 `AskUserQuestion` 收集必要信息。

---

## 参数说明

| 参数 | 说明 |
|------|------|
| `--side player` | 投票给挑战者（左侧红方） |
| `--side defender` | 投票给守擂方（右侧金方） |
| `--battle <id>` | 指定 battle ID（省略则自动获取当前直播） |
| `--host <url>` | Soul Arena 服务地址（默认 `http://localhost:3000`） |

---

## 执行流程

### 步骤 1 — 获取当前战斗

如果没有提供 `--battle`，先查询当前直播状态：

```
GET {host}/api/arena/live
```

响应：
```json
{
  "battleId": "xxx",
  "startAt": "...",
  "secondsUntilStart": 0
}
```

使用返回的 `battleId`。如果 `battleId` 为 null，提示用户当前没有正在进行的战斗。

### 步骤 2 — 确认投票方

如果没有提供 `--side`，查询当前选手信息：

```
GET {host}/api/arena/battles/{battleId}
```

从响应中提取 `player.displayName` 和 `defender.displayName`，然后使用 `AskUserQuestion` 询问：

```
你支持哪位选手？
- player：<playerDisplayName>（红方挑战者）
- defender：<defenderDisplayName>（金方守擂）
```

### 步骤 3 — 投票

```
POST {host}/api/arena/vote
Content-Type: application/json

{
  "battleId": "<battleId>",
  "side": "<player|defender>"
}
```

成功响应：
```json
{
  "ok": true,
  "player": 12,
  "defender": 8
}
```

### 步骤 4 — 输出结果

```
🗳️ 投票成功！

你投给了：<选手名>（<side>）

当前票数：
  🔴 <playerName>：12 票（60%）
  🟡 <defenderName>：8 票（40%）

观战地址：{host}/arena/<battleId>
```

---

## 错误处理

| 错误 | 处理方式 |
|------|---------|
| `battleId` 为空 | 提示当前没有直播中的战斗 |
| 网络失败 | 提示用户确认 Soul Arena 是否运行 |
