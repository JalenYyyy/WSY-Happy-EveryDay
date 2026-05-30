# 小月天天开心技术文档

## 1. 技术栈

- Framework：Next.js 16 App Router
- Language：TypeScript
- UI：React 19、Tailwind CSS、lucide-react
- Database：SQLite
- ORM：Prisma Client
- Build config：`next.config.ts` 显式固定 `turbopack.root` 到当前仓库，避免上级目录存在其他 lockfile 时误判工作区根目录
- Auth：自定义 Cookie Session
- LLM（猫咪聊天）：OpenAI 兼容 `/v1/chat/completions`（`lib/llm.ts`）
- LLM（Pi Agent）：`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`，使用同一组 LLM 环境变量
- Local files：猫咪头像上传到 `public/uploads/cats`
- Local files：用户头像上传到 `public/uploads/users`

## 2. 目录结构

```text
app/
  api/
    auth/
      recovery/        # GET/POST/PATCH → 恢复码状态、生成、重置密码
    cats/
    pi/
      sessions/
        [id]/
          prompt/      # POST → SSE 流
          abort/       # POST → 中止
          events/      # 桩（未实现）
          model/       # 桩（未实现）
          steer/       # 桩（未实现）
          thinking/    # 桩（未实现）
          upload/      # POST → 上传文件（图片 + 文本）
          files/
            [...path]/ # GET → 下载生成的文件
      commands/        # 桩（未实现）
      models/          # 桩（未实现）
    whispers/
  agent/
    page.tsx           # 受保护的 /agent 页面
  login/
  page.tsx
components/
  chat-app.tsx
  agent/
    chat-ui.tsx        # ChatGPT 风格 Agent UI
lib/
  auth.ts
  auth-recovery.ts
  llm.ts
  prisma.ts
  pi/
    model.ts           # 构造 pi-ai 模型对象
    tools.ts           # read_file / write_file / bash / web_search / fetch_url / generate_word_doc / generate_text_file
    agent-manager.ts   # 全局会话 Map 管理
    file-store.ts      # 会话文件存储（上传 / 生成文件路径管理）
prisma/
  schema.prisma
  init-db.ts
  seed.ts
scripts/
  pi-file-maintenance.ts # 清理 Pi Agent 过期文件与孤儿文件
public/
  avatars/
  uploads/
    cats/
    users/
    moments/
```

## 3. 数据模型

### User

保存固定用户账号。

关键字段：
- `id`（默认账号使用固定 id 维护）
- `username`
- `name`
- `avatarUrl`
- `bio`
- `password`

密码当前以哈希形式存储；旧明文数据会在成功登录后自动迁移。

### Cat

保存猫咪基础设定。

关键字段：
- `name`
- `avatarUrl`
- `personality`
- `tone`
- `backstory`
- `isDefault`

### CatUserName

保存每只猫对每个用户的专属关系信息。

约束：
- `catId + userId` 唯一。

关键字段：
- `nickname`
- `preference`
- `memorySummary`
- `relationship`

### Message

保存聊天记录。

关键字段：
- `catId`
- `userId`
- `role`
- `messageType`
- `content`
- `imageUrl`
- `createdAt`

`role` 当前使用字符串：`USER`、`CAT`、`SYSTEM`。

`messageType` 当前支持：`TEXT`、`IMAGE`。

### CatMoment

保存猫咪猫圈 / 电子相册内容。

关键字段：
- `catId`
- `imageUrl`
- `caption`
- `createdAt`

### CatMemory

保存猫咪长期记忆摘要和关系状态。

当前策略：
- 每次用户发言后，将用户消息压缩成一行追加到摘要。
- 最多保留最近 12 行。

### AppSetting

预留应用设置表。

当前用途：
- seed `llmProvider = openai-compatible`
- 持久化登录失败节流状态
- 持久化高频写接口的动作节流状态

### PasswordRecovery

保存每个用户当前生效的一组忘记密码恢复码。

关键字段：
- `userId`
- `codeHash`
- `codeSuffix`
- `expiresAt`
- `createdAt`
- `updatedAt`

当前策略：
- 每个用户同时只保留一组恢复码，重新生成会覆盖旧码。
- 恢复码以一次性明文返回前端，数据库只保存哈希和尾号。
- 恢复成功后会立刻删除记录，避免重复使用。

### AgentFile

保存 Pi Agent 上传文件和生成文件的元数据台账。

关键字段：
- `sessionId`
- `userId`
- `kind`（`UPLOAD` / `GENERATED`）
- `originalName`
- `storedName`
- `mimeType`
- `size`
- `storagePath`
- `downloadPath`
- `status`（`ACTIVE` / `EXPIRED` / `DELETED`）
- `expiresAt`
- `lastDownloadedAt`

当前策略：
- 上传文件默认保留 24 小时。
- 生成文件默认保留 7 天。
- 过期文件和孤儿文件由清理脚本以及运行时维护逻辑定期清除。

### WhisperCard

保存双用户之间的悄悄话留言卡。

关键字段：
- `senderId`
- `recipientId`
- `content`
- `deliverAt`
- `editedAt`
- `readAt`
- `createdAt`

规则：
- 只保留送达时间，不再设置过期或隐藏删除时间。
- 发送方仅可在送达前编辑内容或送达时间。
- 发送方可随时删除卡片，删除后双方都不可见。

### WhisperReply

保存悄悄话留言卡下的即时回复。

关键字段：
- `cardId`
- `senderId`
- `recipientId`
- `content`
- `readAt`
- `createdAt`

规则：
- 仅已送达的留言卡可回复。
- 删除留言卡时，相关回复会级联删除。

## 4. 认证设计

认证逻辑位于 `lib/auth.ts`。

- 登录接口校验数据库中的用户账号密码，并兼容旧明文密码在成功登录后自动迁移为哈希。
- 服务端生成 HMAC 签名 Session Token。
- Token 写入 HttpOnly Cookie：`cat_session`。
- Session Token 会绑定当前密码状态；修改密码后，旧登录态会自动失效。
- 登录后的个人资料弹窗支持生成一组恢复码；恢复码只展示一次，默认 30 天过期。
- 登录页可通过恢复码重置密码；如果服务端配置了 `ADMIN_RESET_PASSWORD`，也可改用管理员密码协助重置。
- 无论使用恢复码还是管理员密码，重置成功后都会同步清空该恢复码，并让旧登录态全部失效。
- API 使用 `requireApiUser()` 校验登录。
- 页面使用 `requireUser()` 校验登录并跳转 `/login`。
- 登录接口带有基础失败节流：同一来源对同一用户名连续输错 5 次后会临时锁定 10 分钟。
- 恢复码重置接口也有独立失败节流：同一来源对同一用户名连续输错 5 次后会临时锁定 10 分钟。
- 节流状态当前持久化在 `AppSetting` 中，key 前缀为 `loginThrottle:`，因此服务重启后不会立刻丢失锁定状态。
- 恢复码节流状态同样持久化在 `AppSetting` 中，key 前缀为 `passwordRecoveryThrottle:`。

生产注意事项：
- 必须设置强随机 `APP_SESSION_SECRET`。
- 密码必须哈希存储。
- 当前仍建议后续补充 CSRF 和更完整的密码策略；如果要扩展到多实例部署，登录节流应再迁移到更明确的共享存储。

## 5. API 设计

### Auth

- `POST /api/auth/login`
  - `GET` 时返回登录页用户列表
  - 入参：`username`、`password`
  - 出参：当前用户信息
- `PATCH /api/auth/login`
  - 在登录页为指定用户修改密码
  - 入参：`username`、`currentPassword`、`newPassword`
- `POST /api/auth/logout`
  - 清除 Cookie
- `GET /api/auth/recovery`
  - 返回当前登录用户的恢复码配置状态
- `POST /api/auth/recovery`
  - 为当前登录用户生成新的恢复码
  - 返回恢复码明文（仅本次）和当前状态
- `PATCH /api/auth/recovery`
  - 使用恢复码或管理员密码重置指定用户的密码
  - 入参：`username`、`newPassword`，以及 `recoveryCode` / `adminPassword` 二选一
- `GET /api/auth/me`
  - 返回当前登录用户
- `PATCH /api/auth/me`
  - 仅更新当前登录用户自己的资料
  - 支持修改 `username`、`name`、`bio`
- `POST /api/auth/me/avatar`
  - 上传当前登录用户头像
  - 限制 2MB
  - 仅支持 png、jpg、webp、gif
  - 服务端按文件头校验真实格式，而不是只信任 MIME type 或文件后缀

### Cats

- `GET /api/cats`
  - 返回猫咪列表和用户列表
- `POST /api/cats`
  - 创建猫咪基础资料
  - 重名返回 `409`
- `PATCH /api/cats/:catId`
  - 更新猫咪基础资料
- `DELETE /api/cats/:catId`
  - 删除猫咪
  - 入参：`confirmName`
  - 服务端 trim 后与猫咪名称比对
  - 至少保留一只猫咪
- `POST /api/cats/:catId/avatar`
  - 上传头像
  - 限制 2MB
  - 仅支持 png、jpg、webp、gif
  - 服务端按文件头校验真实格式，而不是只信任 MIME type 或文件后缀
- `PATCH /api/cats/:catId/nicknames`
  - 仅更新当前登录用户自己的称呼和偏好

### Messages

- `GET /api/cats/:catId/messages`
  - 获取该猫咪共享聊天记录
- `POST /api/cats/:catId/messages`
  - 保存用户消息
  - 支持文本 JSON 或图片 `multipart/form-data`
  - 图片仅支持 png、jpg、webp、gif，并校验文件头
  - 调用 LLM
  - 保存猫咪回复
  - 更新共享长期记忆
  - 更新当前用户的专属记忆和关系状态
  - 如果发送的是图片，会自动写入猫咪猫圈

### Moments

- `GET /api/cats/:catId/moments`
  - 获取猫咪猫圈 / 电子相册

### Whispers

- `GET /api/whispers`
  - 返回当前用户与另一位用户之间的悄悄话概览
- `POST /api/whispers`
  - 创建一张悄悄话留言卡
  - 入参：`recipientId`、`content`、`deliverAt`
- `PATCH /api/whispers/:cardId`
  - 仅允许发送方在送达前编辑留言卡
- `DELETE /api/whispers/:cardId`
  - 允许发送方随时删除留言卡
  - 删除后双方都不可见，相关回复一并删除
- `POST /api/whispers/:cardId/replies`
  - 对已送达留言卡发送即时回复
- `POST /api/whispers/read`
  - 将当前可见的悄悄话留言卡与回复标记为已读

### Pi Agent

- `POST /api/pi/sessions`
  - 创建新 Agent 会话
  - 出参：`{ sessionId: string }`
- `DELETE /api/pi/sessions/:id`
  - 从内存中删除 Agent 会话
- `POST /api/pi/sessions/:id/prompt`
  - 向 Agent 发送消息，以 SSE 流返回事件序列
  - 入参：`{ message: string }`
  - SSE 事件格式：`data: { type, ... }\n\n`
    - `text_delta`：`{ type, delta: string }` — 文本增量
    - `tool_start`：`{ type, name, label, args }` — 工具调用开始
    - `tool_end`：`{ type, name, result: string }` — 工具调用结束
    - `agent_end`：`{ type }` — 本轮生成结束
    - `error`：`{ type, message: string }` — 错误
- `POST /api/pi/sessions/:id/abort`
  - 中止当前正在进行的生成
  - 出参：`{ ok: true }`
- `POST /api/pi/sessions/:id/upload`
  - 上传文件（multipart/form-data，字段名 `file`，可多文件）
  - 支持图片（PNG/JPG/WEBP/GIF）和文本文件（txt/md/csv/json/html 等）
  - 单文件限制 20MB
  - 出参：`{ files: Array<{ id, name, mimeType, size, expiresAt, textContent? }> }`
- `GET /api/pi/sessions/:id/files`
  - 列出该会话已生成的可下载文件
  - 只返回未过期且状态为有效的生成文件
  - 出参：`{ files: Array<{ name, size, expiresAt, downloadPath }> }`
- `GET /api/pi/sessions/:id/files/:filename`
  - 下载指定文件（流式返回，附带 Content-Disposition）
  - 仅允许下载未过期且属于当前用户当前会话的文件

## 6. LLM 接入

逻辑位于 `lib/llm.ts`。

环境变量：

```bash
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY=""
LLM_MODEL="deepseek-v4-pro"
```

调用路径：

```text
{LLM_BASE_URL}/v1/chat/completions
```

Prompt 由以下内容组成：
- 猫咪名字
- 性格
- 语气
- 背景故事
- 当前用户称呼
- 共享长期记忆摘要
- 当前用户偏好
- 当前用户专属记忆
- 当前用户关系状态
- 最近 14 条消息
- 当前用户消息
- 可选图片内容（当用户发送图片时）

失败策略：
- 未配置模型时返回明确提示。
- 请求失败或空回复时返回本地备用回复。
- API 返回 `usedFallback` 给前端展示提示。

## 7. SQLite 初始化说明

当前项目没有直接使用 `prisma db push`，因为本地 Windows 环境中 Prisma schema engine 曾出现无详细信息的失败。

当前命令：

```bash
npm run db:push
```

实际执行：

```bash
prisma generate && tsx prisma/init-db.ts
```

`prisma/init-db.ts` 使用 Prisma Client 执行 SQLite 建表 SQL。应用运行仍然使用 Prisma Client。

当本地 SQLite 表结构落后于当前 schema 时，`prisma/init-db.ts` 也会执行必要的轻量迁移，例如重建 `WhisperCard` 以移除已废弃的旧列。

后续上生产建议恢复标准 migration 流程：

```bash
prisma migrate dev
prisma migrate deploy
```

或迁移到 Postgres 后使用正式 Prisma Migration。

## 8. 文件上传

- 默认头像位于 `public/avatars`。
- 用户上传头像位于 `public/uploads/users`。
- 猫咪上传头像位于 `public/uploads/cats`。
- 聊天图片 / 猫圈图片位于 `public/uploads/moments`。
- 所有上传图片仅支持 png、jpg、webp、gif，且服务端会按文件头识别真实格式。
- 删除猫咪时，如果头像路径以 `/uploads/cats/` 开头，会同步删除本地文件。
- 替换猫咪头像时，会删除旧的上传头像文件。
- 删除单条猫圈时，会同步删除该条对应的本地图片文件。

生产建议：
- 改为 S3、Cloudflare R2、阿里 OSS 等对象存储。
- 数据库只保存对象 URL 或 key。

## 9. Pi Agent 架构

### 依赖包

- `@earendil-works/pi-agent-core`：Agent 运行时，提供 `Agent` 类和工具调用协议。
- `@earendil-works/pi-ai`：统一 LLM API 抽象，提供 `Model` 类型和 TypeBox 重导出（`Type`）。

### 关键模块

**`lib/pi/model.ts`**

从环境变量构造 `Model<"openai-completions">` 对象，供 `Agent` 使用。

```ts
{
  id: process.env.LLM_MODEL ?? "deepseek-chat",
  api: "openai-completions",
  provider: "custom",
  baseUrl: process.env.LLM_BASE_URL ?? "",
  // ...
}
```

**`lib/pi/tools.ts`**

定义三个内置工具，参数使用 TypeBox `Type.Object` 描述：

| 工具名 | 功能 | 沙盒策略 |
|---|---|---|
| `read_file` | 读取文件内容 | path.resolve 限制在 cwd |
| `write_file` | 写入文件内容 | path.resolve 限制在 cwd |
| `bash` | 执行 Shell 命令 | cwd = process.cwd()，超时 30s |
| `web_search` | Tavily 关键词搜索，返回摘要和链接 | 需要 `TAVILY_API_KEY`，默认 5 条结果 |
| `fetch_url` | 抓取网页纯文本内容 | 15s 超时，输出截断至 4000 字 |

Windows 兼容：`exec` 使用 `shell: true`，不依赖 `/bin/bash`。

工具数组：`agentTools`（无联网）和 `webAgentTools`（含 `web_search` + `fetch_url`，Agent 默认使用此数组）。

文档生成工具在执行时会从 `AsyncLocalStorage` 读取 `sessionId + userId`，并把生成文件登记到 `AgentFile` 元数据表。

**`lib/pi/agent-manager.ts`**

使用 `global.agentSessions: Map<string, Agent>` 管理会话，Next.js dev 热重载安全。

系统提示中额外约束了 Agent 行为：

- 严格按用户请求执行，不自行扩展输出形式。
- 只有用户明确要求导出文档或下载文件时，才允许调用 `generate_word_doc` / `generate_text_file`。
- 如果用户目标、范围或输出格式不清楚，先追问澄清，再决定是否调用工具。

```ts
createSession(id)  // 创建并存储 Agent 实例
getSession(id)     // 获取已有 Agent
deleteSession(id)  // 删除并释放 Agent
```

**`lib/pi/file-store.ts`**

统一处理 Pi Agent 的文件落盘、元数据登记和清理逻辑：

- 上传文件写入 `tmp/pi/<sessionId>/uploads/`
- 生成文件写入 `tmp/pi/<sessionId>/generated/`
- 所有文件同步登记到 `AgentFile`
- 下载和列表以数据库元数据为准，不直接扫描目录
- 定期清理过期文件和孤儿文件

### SSE 流协议

前端使用 `fetch` + `ReadableStream` reader（不用 `EventSource`，因其不支持 POST）。

每帧格式：

```
data: {"type":"text_delta","delta":"..."}\n\n
data: {"type":"tool_start","name":"bash","label":"Run Command","args":{...}}\n\n
data: {"type":"tool_end","name":"bash","result":"..."}\n\n
data: {"type":"agent_end"}\n\n
```

### 安全注意事项

- `bash` 工具目前没有命令白名单，Agent 可执行任意命令，**仅适合本地受信使用**。
- 生产环境须限制执行路径或改用容器沙盒。
- Agent 会话不持久化，进程重启后全部丢失。
- 当前没有会话数量上限，长时间运行应增加 LRU 清理。

