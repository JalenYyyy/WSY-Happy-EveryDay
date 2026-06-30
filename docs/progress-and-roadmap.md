# 当前开发进度与后续计划

## 1. 当前版本状态

当前项目处于可上线小范围试用阶段。

已完成：
- Next.js 全栈项目搭建。
- SQLite + Prisma Client 数据层。
- 本地数据库初始化脚本。
- 默认用户和默认猫咪 seed。
- 登录、登出、会话保持。
- 登录失败限流。
- 登录页修改密码。
- 忘记密码恢复码。
- 管理员协助密码重置。
- 改密码后旧会话自动失效。
- 猫咪列表。
- 共享聊天。
- 图片消息与猫圈电子相册。
- OpenAI 兼容 LLM 调用。
- 模型不可用备用回复。
- 猫咪创建、编辑、删除。
- 用户可设置一个供所有猫咪通用的称呼。
- 猫咪性格 / 回复方式 / 补充设定可编辑，默认留空。
- 双用户悄悄话留言卡。
- PWA manifest。
- 基础苹果风 UI。
- 本地构建和类型检查通过。
- Pi Agent 文件上传功能（图片 + 文本文件注入 LLM 上下文）。
- Pi Agent 文档生成工具（`generate_word_doc` → .docx，`generate_text_file` → 纯文本）。
- Pi Agent 对话界面（ChatGPT 风格，位于 `/agent`）。
- Agent 内置工具：文件读写、Shell 命令执行。
- Agent 联网工具：`web_search`（Tavily）、`fetch_url`（网页抓取）。
- 主界面侧边栏新增 Agent 跳转入口（头像下方独立按钮）。
- Pi Agent 工具执行过程改为展示“处理思路”摘要，不再直接暴露命令/参数明细。
- Pi Agent 新增严格执行约束：不默认生成文档，需求不清先追问。
- Pi Agent 文件生命周期管理：元数据台账、过期时间、清理脚本、会话删除联动清理。
- 每只猫的电子相册升级为纯照片优先的照片墙浏览，并支持沉浸式逐张预览。

## 2. 最近完成的关键变更

### 名字精简后的设定能力回补（2026-05-31）

在继续保持“默认空白、轻量使用”的前提下，把真正还需要的两类设定能力补了回来。

- 用户资料弹窗可以设置“猫咪们怎么称呼我”；留空保存会恢复为直接叫用户名字。
- 这项称呼设定现已改为用户级通用设置：保存一次后，对所有猫咪统一生效。
- 猫咪设置抽屉重新支持编辑性格、回复方式和补充设定，但默认仍全部为空。
- 猫咪聊天上下文重新接入上述设定：有专属称呼时优先使用，没有就回退为用户真实名字。
- `/api/cats` 会按当前登录用户返回对应猫咪的专属称呼；`PATCH /api/cats/:catId/nicknames` 重新启用。

相关文件：`components/chat-app.tsx`、`app/page.tsx`、`app/api/cats/`、`lib/llm.ts`。

### Pi Agent 生产构建修复（2026-05-31）

修复了 `/agent` 在生产构建与 `next start` 下触发的动态模块加载问题。

- 原因是 Pi Agent 依赖链被 Turbopack 打进根服务端 chunk 后，会命中 `@earendil-works/pi-ai` 内部的动态环境探测逻辑。
- 现在通过 `serverExternalPackages` 将 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@tavily/core`、`docx` 和 `typebox` 改为服务端外置加载。
- 同时把 `Type` 的导入从 `@earendil-works/pi-ai` 顶层入口收窄为直接来自 `typebox`，减少不必要的顶层依赖。
- 修复后，生产构建可完成，`next start` 不再在启动时抛出该动态模块错误，Pi Agent 会话与 prompt 接口可正常访问。

相关文件：`next.config.ts`、`lib/pi/tools.ts`。

### 用户与猫咪精简为仅保留名字（2026-05-30）

把当前产品进一步收敛到更轻的双人私用版本，账号和猫咪都不再对外暴露额外设定。

- 默认账号改成了 `月 / cat123` 和 `泽 / cat123`。
- 登录页、主页侧边栏和聊天头部都改为只展示名字，不再依赖头像。
- 创建猫咪与编辑猫咪都只保留名字输入。
- 聊天上下文不再使用猫咪性格、语气、背景故事、专属称呼、互动偏好和关系记忆。
- 用户头像、猫咪头像、专属称呼相关接口已停用，返回明确提示。
- seed 会清理历史头像、简介、猫咪个性和关系记忆残留，保证数据口径一致。

相关文件：`prisma/seed.ts`、`lib/llm.ts`、`app/api/auth/me/`、`app/api/cats/`、`app/page.tsx`、`app/login/`、`components/chat-app.tsx`。

### 忘记密码恢复码（2026-05-30）

为当前双用户本地账号体系补上了不依赖邮箱的忘记密码方案。

- 登录后的个人资料弹窗现在可以生成一组恢复码，只展示一次，默认 30 天过期。
- 数据库只保存恢复码哈希和尾号；重新生成会覆盖旧恢复码。
- 登录页新增“忘记密码”入口，可用恢复码直接重置当前选中用户的密码。
- 恢复成功后会自动删除该恢复码，并让旧登录态全部失效。
- 恢复码错误也带独立节流，避免暴力猜测。
- 如果服务端配置了管理员密码，登录页也可切换到管理员协助重置模式。

相关文件：`prisma/schema.prisma`、`prisma/init-db.ts`、`prisma/seed.ts`、`lib/auth.ts`、`lib/auth-recovery.ts`、`app/api/auth/recovery/route.ts`、`app/login/page.tsx`、`components/chat-app.tsx`。

### 电子相册浏览模式升级（2026-05-30）

把原来更偏“动态卡片”的猫圈，升级成了更适合回看照片的电子相册模式。

- 保留现有自动入册逻辑：发给猫咪的图片仍会自动进入对应猫咪的相册。
- 相册主视图改为按时间倒序的照片墙，更适合快速浏览所有照片。
- 列表和预览都弱化文字描述，只突出照片与时间。
- 点击任意照片后进入沉浸式大图预览，并支持上一张 / 下一张连续切换。
- 删除照片的行为保持不变，仍会同步从电子相册中移除。

相关文件：`components/chat-app.tsx`。

### Pi Agent 文件生命周期治理（2026-05-30）

为上传文件和生成文件增加了可维护的生命周期管理方案，避免临时文件长期堆积。

- 新增 `AgentFile` 元数据表，记录文件所属用户、会话、类型、磁盘路径、状态、过期时间和最近下载时间。
- 上传文件默认保留 24 小时，生成文件默认保留 7 天；列表和下载都只认未过期的元数据记录。
- 新增 `npm run pi:cleanup-files` 清理脚本，用于删除过期记录对应文件和磁盘上的孤儿文件。
- 会话删除时，会同步删除该会话的上传/生成文件，并把元数据标记为已删除。
- 文件接口和文档生成工具都改为走元数据台账，后续可以继续扩展配额和长期保存能力。

相关文件：`prisma/schema.prisma`、`prisma/init-db.ts`、`lib/pi/file-store.ts`、`lib/pi/tools.ts`、`app/api/pi/sessions/[id]/upload/route.ts`、`app/api/pi/sessions/[id]/files/`、`app/api/pi/sessions/[id]/route.ts`、`scripts/pi-file-maintenance.ts`。

### Pi Agent 首次会话初始化修复（2026-05-30）

修复了第一次进入 `/agent` 页面时会自动创建两个 `New Chat` 会话的问题。

- 原因是开发环境下首次加载 effect 可能被重复执行，导致初始化会话接口被调用两次。
- 现在首次自动建会话增加了一次性保护，首次进入只会创建一个默认会话。
- 手动点击“新聊天”按钮的行为不受影响。

相关文件：`components/agent/chat-ui.tsx`。

### Pi Agent 执行约束收紧（2026-05-30）

收紧了 Pi Agent 的系统提示，减少“自作主张”行为：

- 如果用户没有明确要求导出为 Word、文本、CSV、JSON、Markdown 等文件，Agent 不会自行生成下载文件。
- 如果用户只是让 Agent 分析、解释、总结、提取信息，Agent 会直接在对话中回答，而不是默认产出文档。
- 如果用户需求、输出格式或范围不够清楚，Agent 必须先提一个澄清问题，再决定是否调用工具或生成文件。

相关文件：`lib/pi/agent-manager.ts`。

### Pi Agent 交互展示优化（2026-05-30）

Pi Agent 在生成最终答案前，不再把工具调用的命令、参数和原始输出直接展示给用户。

- 助手消息改为显示“处理思路”摘要卡片，按步骤说明当前正在做什么。
- 当 Agent 完成后，界面保留最终回答与下载按钮，不再出现可展开的命令明细卡片。
- 这样既保留了处理过程的可感知性，也避免大量命令文本影响阅读体验。

相关文件：`components/agent/chat-ui.tsx`。

### Pi Agent 文件上传与文档生成（2026-05-30）

为 Pi Agent 添加了完整的文件处理能力：

**上传能力**：
- 输入框旁新增回形针按钮，支持上传图片（PNG/JPG/WEBP/GIF）和文本文件（.txt/.md/.csv/.json/.html 等）。
- 上传后文件内容作为上下文注入到 LLM 消息中；图片文件在用户气泡中以缩略图展示。
- 文件大小限制：单文件 20MB。

**生成能力**：
- Agent 新增 `generate_word_doc` 工具：根据 Markdown 内容创建 .docx 文件，支持 #/##/### 标题、**加粗** 语法。
- Agent 新增 `generate_text_file` 工具：生成 .txt/.csv/.json/.md 等纯文本文件。
- 助手消息中的下载链接渲染为蓝色下载按钮，点击即可下载。

**存储**：
- 上传文件暂存于 `tmp/pi/<sessionId>/uploads/`（服务器端）
- 生成文件暂存于 `tmp/pi/<sessionId>/generated/`，通过 `/api/pi/sessions/:id/files/:filename` 下载。

相关文件：`lib/pi/file-store.ts`、`lib/pi/tools.ts`（新增工具）、`app/api/pi/sessions/[id]/upload/route.ts`、`app/api/pi/sessions/[id]/files/`、`components/agent/chat-ui.tsx`。

### Pi Agent 联网工具（2026-05-30）

新增两个联网 Tool，通过 `webAgentTools` 数组注册到 `agent-manager.ts`：

- `web_search`：调用 Tavily API (`@tavily/core`) 搜索关键词，返回摘要 + Top-5 结果（标题、URL、摘要段落）。需要 `TAVILY_API_KEY` 环境变量。
- `fetch_url`：用 Node 内置 `fetch` 抓取任意 URL 的纯文本，去除 `<script>`、`<style>`、HTML 标签后截断至 4000 字。无需额外 key。

相关文件：`lib/pi/tools.ts`、`lib/pi/agent-manager.ts`、`.env`。

### Pi Agent 对话界面（2026-05-30）

在 `/agent` 路由下新增了 ChatGPT 风格的 Agent 对话界面，基于 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai`。

已完成内容：
- `lib/pi/model.ts`：从 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 构造 `openai-completions` 模型对象。
- `lib/pi/tools.ts`：三个内置工具——`read_file`（读文件）、`write_file`（写文件）、`bash`（执行 Shell 命令）。工具路径沙盒在 `process.cwd()`。
- `lib/pi/agent-manager.ts`：`global.agentSessions` 单例管理内存会话，热重载安全。
- `app/api/pi/sessions/`：`POST` 创建会话、`DELETE` 删除会话。
- `app/api/pi/sessions/[id]/prompt/`：`POST` 发送消息，SSE 流返回 `text_delta` / `tool_start` / `tool_end` / `agent_end` / `error`。
- `app/api/pi/sessions/[id]/abort/`：`POST` 中止当前生成。
- `app/agent/page.tsx`：受 `requireUser()` 保护的 `/agent` 页面。
- `components/agent/chat-ui.tsx`：ChatGPT 风格 UI——深色双栏布局（`#171717` 侧栏 + `#212121` 主区）、用户消息右侧圆角气泡、AI 消息带 Bot 头像无背景全宽文本、自适应高度输入框、`ArrowUp` 圆形发送按钮、打字光标动画，以及基于工具调用生成的“处理思路”摘要卡片。
- `components/chat-app.tsx`：侧边栏用户信息区新增 Bot 图标按钮，点击跳转 `/agent`。

### 创建猫咪流程

已从“点击加号立即创建”改为“确认后创建”。

当前行为：
- 点击加号打开完整创建表单。
- 用户可填写头像、名字、性格、语气、背景故事、称呼。
- 点击取消不会新增猫咪。
- 点击确认才写入数据库。
- 创建完成后直接回到聊天界面。

### 删除猫咪流程

已增加防误删机制。

当前行为：
- 删除入口在设置抽屉底部危险操作区。
- 必须输入猫咪当前名称。
- 前后空格会 trim。
- 服务端二次校验确认名称。
- 至少保留一只猫。
- 删除时清理上传头像文件。

### 空白草稿清理

旧创建流程遗留的空白“新猫咪”已清理。当前数据库恢复为 5 只默认猫。

### 双用户悄悄话留言卡

已完成当前 MVP 版本实现。

当前行为：
- 左侧猫咪列表下方新增“小月也是老大”互动入口，与猫功能分区显示。
- 支持创建悄悄话留言卡，并设定送达时间。
- 送达前仅发送者可见，且支持继续编辑。
- 发送方可随时带确认删除，删除后双方都不可见，相关回复会一起删除。
- 送达后双方可见，并支持即时回复。
- 如果不手动删除，就会一直保留。
- 已接入未读计数、进入面板自动标记已读，以及前端轮询提醒。
- 留言卡已调整为信封入口 + 独立信纸弹层的交互形式。

## 3. 当前验证记录

已执行并通过：

```bash
npm run db:reset
npm run lint
npm run build
npm run smoke:login-throttle
```

已手动/API 验证（2026-05-30 账号恢复）：
- 登录后可生成恢复码，接口返回明文恢复码和状态。✅
- 使用恢复码重置密码后，旧登录态立即失效。✅
- 旧密码登录返回 401，新密码可正常登录。✅
- 同一恢复码第二次使用返回 400，不可复用。✅

已手动/API 验证（2026-05-30 Pi Agent）：
- `/agent` 页面未登录时跳转 `/login`。✅
- `POST /api/pi/sessions` 未登录返回 401。✅
- `POST /api/pi/sessions` 已登录返回 200 + sessionId。✅
- `POST /api/pi/sessions/[id]/prompt` SSE 流式返回 text_delta、tool_start/end、agent_end 事件。✅
- `POST /api/pi/sessions/[id]/abort` 返回 200。✅
- `DELETE /api/pi/sessions/[id]` 返回 200 `{"ok":true}`。✅
- 新建会话后可发送消息，SSE 流式接收文本。
- 工具调用卡片展开/折叠正常。
- 停止生成按钮触发 abort。

**已修复的 Bug（本轮）：**
- `sessions/route.ts` 缺少 `try/catch`，未登录时返回 500 → 已修复为 401。
- `agent-manager.ts` 未向 Agent 传递 `getApiKey`，导致 LLM 无法认证 → 已修复。
- `.env` `LLM_MODEL=deepseek-v4-pro` 无效模型名 → 已修复为 `deepseek-chat`。

已手动/API 验证（猫咪功能）：
- 登录。
- 获取猫咪列表。
- 创建猫咪。
- 创建时保存头像和称呼。
- 取消创建不新增猫咪。
- 删除猫咪确认校验。
- 删除猫咪 trim 校验。
- 发送消息。
- 发送图片消息与猫圈写入。
- 共享聊天记录。
- 悄悄话留言卡获取、创建、删除。
- 未登录 API 401 校验。

## 4. 当前技术债

### 技术债 - Pi Agent

- 会话数据当前存储在 Node.js 进程内存，进程重启后所有会话丢失。
- `bash` 工具沙盒范围是整个 `process.cwd()`，生产环境应增加路径白名单或容器隔离。
- 当前没有会话上限，长时间运行后内存可能无限增长，后续需要 LRU 清理。
- Agent 工具调用日志没有持久化，无法事后审计。



- 已完成密码哈希存储与旧数据登录迁移。
- 已完成登录失败限流。
- 已完成改密码后旧会话自动失效。
- 当前仍没有完整的多设备会话管理和 CSRF 保护。
- 当前忘记密码仍采用本地预生成恢复码，不支持邮箱 / 短信投递或人工审批找回。

### 数据库

- SQLite 仍只适合低并发、小规模使用。
- 当前建表使用 `prisma/init-db.ts`，不是正式 migration。
- 无备份/恢复机制。

### LLM

- 不支持流式回复。
- 不支持多模型后台切换。
- 长期记忆策略较简单。
- 当前没有精细的 token 成本控制。
- 没有模型调用日志和失败监控。

### 前端

- 没有独立组件库拆分。
- 没有自动化 E2E 测试。
- 移动端已适配基础布局，但仍建议真实设备细调。

### 部署

- 当前代码已经适合低频、小范围上线试用。
- 正式部署仍需要处理 SQLite 持久化、上传文件持久化、环境变量和 HTTPS。
- Windows 本地开发环境偶发 Prisma DLL 占用问题，不建议把 Windows 作为正式部署环境。

## 5. 后续开发路线

### Phase 1：上线试用收尾

- 增加自动化 smoke test。
- 增加最基本的数据备份方案。
- 增加部署文档或一键部署脚本。
- 优化移动端设置抽屉高度和键盘体验。
- 增加基础错误边界和关键操作日志。

### Phase 2：生产化部署

- 数据库迁移到 Postgres。
- 使用 Prisma Migration。
- 头像迁移到对象存储。
- 增加 Dockerfile 或云平台部署文档。
- 增加 `.env.production.example`。
- 增加日志系统和健康检查接口。

### Phase 3：聊天体验增强

- 猫咪聊天支持流式回复。
- 支持重新生成回复。
- 支持删除单条消息。
- 支持消息复制。
- 支持猫咪主动开场白。
- 支持更智能的长期记忆总结。
- 支持"重要记忆"手动 pin。

### Phase 3b：Pi Agent 增强

- Agent 工具扩展：网页抓取、代码执行沙盒、数据库查询。
- 会话历史持久化（当前为内存，重启丢失）。
- 工具执行细粒度权限控制（当前可读写整个 cwd）。
- Agent 界面支持 Markdown 渲染与代码高亮。
- Agent 界面移动端适配。
- 工具调用结果截断与分页展示。
- 可配置 system prompt 和模型参数（temperature、max_tokens）。
- 多 Agent 会话数量上限与 LRU 清理策略。

### Phase 4：模型与配置增强

- 后台配置多个模型供应商。
- 支持豆包、DeepSeek、OpenAI 等 provider presets。
- 支持按猫咪选择模型。
- 支持温度、最大 token、系统提示词模板配置。
- 增加模型调用记录和失败原因展示。

### Phase 5：多用户扩展

- 开放邀请制注册。
- 支持家庭/空间。
- 支持空间成员权限。
- 支持私人聊天和共享聊天并存。
- 支持猫咪导入导出。

## 6. 下一步推荐

优先级最高的下一步：

1. 先用单台 Linux 主机 + 持久化磁盘做低成本上线。
2. 增加最小可用的备份与恢复流程。
3. 增加自动化 smoke test。
4. 用户增长后再迁移到 Postgres + 对象存储。
5. 最后再做聊天流式回复和后台配置增强。

按这个顺序推进，性价比最高，也最符合当前代码现状。
