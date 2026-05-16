# 猫咪小家开发文档

## 1. 环境要求

- Node.js 22+
- npm 10+
- Windows PowerShell 可运行

## 2. 本地启动

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

访问：

```text
http://127.0.0.1:3000
```

## 3. 默认账号

```text
user1 / cat123
user2 / cat123
```

## 4. 环境变量

复制 `.env.example` 为 `.env`，或直接编辑现有 `.env`。

```bash
DATABASE_URL="file:./dev.db"
APP_SESSION_SECRET="local-dev-secret-change-before-production"
LLM_BASE_URL=""
LLM_API_KEY=""
LLM_MODEL=""
```

DeepSeek 示例：

```bash
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="你的 key"
LLM_MODEL="deepseek-chat"
```

## 5. 常用命令

```bash
npm run dev      # 开发服务
npm run build    # 生产构建
npm run start    # 启动生产服务
npm run lint     # TypeScript 类型检查
npm run db:push  # 初始化/同步 SQLite 表
npm run db:seed  # 写入默认用户和猫咪
npm run db:reset # 重置数据库并重新 seed
```

## 6. 开发工作流

### 修改 UI

主要文件：

```text
components/chat-app.tsx
app/globals.css
tailwind.config.ts
```

改完后执行：

```bash
npm run lint
npm run build
```

如果开发服务已运行，Windows 上 `npm run build` 可能因为 Prisma DLL 被占用而失败。先停止 dev server 后再 build。

### 修改 API

主要目录：

```text
app/api/
lib/
prisma/
```

修改 API 后至少验证：
- 未登录返回 401。
- 登录后正常返回。
- 错误输入有明确错误信息。
- 数据写入后刷新页面仍正确。

### 修改数据库

当前本地初始化由 `prisma/init-db.ts` 负责。

如果修改 `prisma/schema.prisma`，需要同步修改：

```text
prisma/init-db.ts
prisma/seed.ts
```

然后执行：

```bash
npm run db:reset
```

## 7. 功能测试清单

### 登录

- `user1` 可登录。
- `user2` 可登录。
- 未登录访问首页会跳转登录页。

### 猫咪列表

- 默认 5 只猫展示正常。
- 选择猫咪后右侧聊天对象切换正常。

### 创建猫咪

- 点加号只打开创建弹窗，不立即创建。
- 取消创建后列表不增加猫咪。
- 创建时可填写头像、名字、性格、语气、背景故事、称呼。
- 创建成功后直接回到聊天界面并选中新猫。
- 重名时提示换名。

### 编辑猫咪

- 设置抽屉可以修改猫咪资料。
- 上传头像后刷新仍显示。
- 修改称呼后后续聊天使用新称呼。

### 删除猫咪

- 删除入口位于危险操作区。
- 输入错误名称不能删除。
- 输入正确名称才能删除。
- 输入前后空格不影响确认。
- 删除后列表移除该猫。
- 删除后相关消息、记忆、称呼被级联清理。
- 不能删除到一只猫都不剩。

### 聊天

- 用户消息能保存。
- 猫咪回复能保存。
- 用户 1 发的消息，用户 2 可见。
- 未配置 LLM 时返回备用回复。
- 配置 LLM 后调用真实模型。

## 8. 代码约定

- TypeScript 开启 `strict`。
- 手写 UI 优先保持苹果风、淡色、紧凑。
- 图标使用 `lucide-react`。
- 危险操作必须二次确认。
- 不把 API key 暴露到前端。
- 新增持久化字段时同时更新文档和 seed。

## 9. 已知注意事项

- 当前密码明文，仅适合 MVP。
- 当前 SQLite 适合本地开发，不适合多人高并发生产。
- 当前头像上传在本地磁盘，云部署时需要对象存储。
- 当前长期记忆是简单摘要追加，不是智能总结。
- 当前没有自动化测试框架，依赖手动/API 冒烟测试。
