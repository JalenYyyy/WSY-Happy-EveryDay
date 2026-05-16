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
- `username`
- `name`
- `password`

当前密码为明文 MVP 实现，生产环境必须迁移为哈希密码。

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

保存每只猫对每个用户的称呼。

约束：
- `catId + userId` 唯一。

### Message

保存聊天记录。

关键字段：
- `catId`
- `userId`
- `role`
- `content`
- `createdAt`

`role` 当前使用字符串：`USER`、`CAT`、`SYSTEM`。

### CatMemory

保存猫咪长期记忆摘要和关系状态。

当前策略：
- 每次用户发言后，将用户消息压缩成一行追加到摘要。
- 最多保留最近 12 行。

### AppSetting

预留应用设置表，目前仅 seed `llmProvider = openai-compatible`。

## 4. 认证设计

认证逻辑位于 `lib/auth.ts`。

- 登录接口校验预设用户账号密码。
- 服务端生成 HMAC 签名 Session Token。
- Token 写入 HttpOnly Cookie：`cat_session`。
- API 使用 `requireApiUser()` 校验登录。
- 页面使用 `requireUser()` 校验登录并跳转 `/login`。

生产注意事项：
- 必须设置强随机 `APP_SESSION_SECRET`。
- 密码必须哈希存储。
- 后续如支持注册，需要补充 CSRF、限流、密码策略。

## 5. API 设计

### Auth

- `POST /api/auth/login`
  - 入参：`username`、`password`
  - 出参：当前用户信息
- `POST /api/auth/logout`
  - 清除 Cookie
- `GET /api/auth/me`
  - 返回当前登录用户

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
  - 支持 png、jpg、webp、gif、svg
- `PATCH /api/cats/:catId/nicknames`
  - 更新猫咪对用户的称呼

### Messages

- `GET /api/cats/:catId/messages`
  - 获取该猫咪共享聊天记录
- `POST /api/cats/:catId/messages`
  - 保存用户消息
  - 调用 LLM
  - 保存猫咪回复
  - 更新长期记忆

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
- 长期记忆摘要
- 关系状态
- 最近 14 条消息
- 当前用户消息

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
- 用户上传头像位于 `public/uploads/cats`。
- 删除猫咪时，如果头像路径以 `/uploads/cats/` 开头，会同步删除本地文件。

生产建议：
- 改为 S3、Cloudflare R2、阿里 OSS 等对象存储。
- 数据库只保存对象 URL 或 key。
