# 猫咪小家技术文档

## 1. 技术栈

- Framework：Next.js 16 App Router
- Language：TypeScript
- UI：React 19、Tailwind CSS、lucide-react
- Database：SQLite
- ORM：Prisma Client
- Auth：自定义 Cookie Session
- LLM：OpenAI 兼容 `/v1/chat/completions`
- Local files：猫咪头像上传到 `public/uploads/cats`
- Local files：用户头像上传到 `public/uploads/users`

## 2. 目录结构

```text
app/
  api/
    auth/
    cats/
  login/
  page.tsx
components/
  chat-app.tsx
lib/
  auth.ts
  llm.ts
  prisma.ts
prisma/
  schema.prisma
  init-db.ts
  seed.ts
public/
  avatars/
  uploads/cats/
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

保存猫咪朋友圈 / 电子相册内容。

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

预留应用设置表，目前仅 seed `llmProvider = openai-compatible`。

## 4. 认证设计

认证逻辑位于 `lib/auth.ts`。

- 登录接口校验数据库中的用户账号密码，并兼容旧明文密码在成功登录后自动迁移为哈希。
- 服务端生成 HMAC 签名 Session Token。
- Token 写入 HttpOnly Cookie：`cat_session`。
- API 使用 `requireApiUser()` 校验登录。
- 页面使用 `requireUser()` 校验登录并跳转 `/login`。
- 登录接口带有基础失败节流：同一来源对同一用户名连续输错 5 次后会临时锁定 10 分钟。
- 节流状态当前持久化在 `AppSetting` 中，key 前缀为 `loginThrottle:`，因此服务重启后不会立刻丢失锁定状态。

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
  - 如果发送的是图片，会自动写入猫咪朋友圈

### Moments

- `GET /api/cats/:catId/moments`
  - 获取猫咪朋友圈 / 电子相册

## 6. LLM 接入

逻辑位于 `lib/llm.ts`。

环境变量：

```bash
LLM_BASE_URL=""
LLM_API_KEY=""
LLM_MODEL=""
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
- 聊天图片 / 朋友圈图片位于 `public/uploads/moments`。
- 所有上传图片仅支持 png、jpg、webp、gif，且服务端会按文件头识别真实格式。
- 删除猫咪时，如果头像路径以 `/uploads/cats/` 开头，会同步删除本地文件。
- 替换猫咪头像时，会删除旧的上传头像文件。
- 删除单条朋友圈时，会同步删除该条对应的本地图片文件。

生产建议：
- 改为 S3、Cloudflare R2、阿里 OSS 等对象存储。
- 数据库只保存对象 URL 或 key。
