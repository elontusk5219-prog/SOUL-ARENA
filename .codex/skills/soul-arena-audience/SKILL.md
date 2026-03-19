---
name: soul-arena-audience
description: 以观众身份进入 Soul Arena 观众席，上传头像和 ID，在 canvas 观众席中显示自己
user-invocable: true
argument-hint: [--name <名字>] [--id <ID>] [--avatar <图片路径>] [--host http://localhost:3000]
---

# Soul Arena 观众入场

以观众身份进入 Soul Arena，你的头像将实时出现在战斗舞台下方的观众席中。

**工具使用：** 使用 `AskUserQuestion` 收集必要信息。

---

## 参数说明

| 参数 | 说明 | 必填 |
|------|------|------|
| `--name <名字>` | 观众显示名称 | ✅ |
| `--id <ID>` | 观众 ID（如 @handle） | 可选 |
| `--avatar <路径>` | 本地图片路径（jpg/png/webp） | 可选 |
| `--host <url>` | Soul Arena 服务地址 | 默认 `http://localhost:3000` |

---

## 执行流程

### 步骤 1 — 收集信息

如果缺少 `--name`，使用 `AskUserQuestion` 询问：
```
你的观众名称是什么？（显示在观众席上）
```

如果缺少 `--avatar`，询问：
```
要上传头像吗？（输入本地图片路径，或直接回车跳过）
```

### 步骤 2 — 处理头像（如有）

如果提供了图片路径：
1. 读取图片文件内容
2. 转换为 base64 data URL：`data:image/<ext>;base64,<base64内容>`
3. 图片大小建议不超过 500KB（压缩或缩放后上传）

### 步骤 3 — 注册入场

```
POST {host}/api/arena/audience
Content-Type: application/json

{
  "displayName": "<名字>",
  "displayId": "<ID 或省略>",
  "avatarDataUrl": "<data:image/...;base64,... 或省略>"
}
```

成功响应：
```json
{
  "member": {
    "id": "...",
    "displayName": "...",
    "createdAt": "..."
  }
}
```

### 步骤 4 — 输出结果

```
🎭 已入场！

观众：<displayName>
你的头像已出现在观众席中。

观战地址：<host>/arena/watch
战斗直播：<host>/arena（有战斗时自动显示）
```

---

## 观众席说明

- 观众席位于战斗舞台底部，分 3 排显示
- 有头像的观众显示真实头像，无头像显示名字首字母彩色圆圈
- 观众头像每 10 秒刷新一次（新观众自动出现）
- 战斗进行时观众会上下轻微晃动（应援动画）

---

## 错误处理

| 错误 | 处理方式 |
|------|---------|
| 网络连接失败 | 提示用户确认 Soul Arena 是否运行 |
| 图片过大 | 提示压缩后重试，或跳过头像 |
