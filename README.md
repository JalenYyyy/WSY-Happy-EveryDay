# 小月天天开心

一个两人共享的猫咪聊天 Web/PWA MVP。支持猫咪聊天、猫圈电子相册、用户独立资料、登录页改密，以及双用户悄悄话留言卡。

## 本地启动

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

打开 `http://localhost:3000`。

## 默认账号

- `user1` / `cat123`
- `user2` / `cat123`

默认账号在 seed 或成功登录后会以哈希形式存储密码，不再保留明文。

## 大模型配置

在 `.env` 中配置 OpenAI 兼容接口：

```bash
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="你的 API Key"
LLM_MODEL="deepseek-v4-pro"
```

如果你更习惯使用 DeepSeek 命名，也支持 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`。未配置任何 API Key 时，应用会使用本地备用回复并在界面提示。

生产环境必须显式设置 `APP_SESSION_SECRET`；未设置时服务会拒绝使用默认回退值。

## 常用命令

```bash
npm run dev      # 开发服务
npm run build    # 生产构建
npm run db:push  # 同步数据库结构
npm run db:seed  # 写入默认用户和猫咪
npm run db:reset # 重置本地数据库并重新 seed
```

## 推荐上线方案

如果当前目标是先低成本、低复杂度上线试用，建议采用下面这套方案：

- 单台 Linux 云主机即可，不必第一阶段就拆数据库和对象存储。
- 继续使用 Next.js + Node.js + SQLite，但把数据库文件和 `public/uploads/` 放到持久化磁盘目录。
- 使用 PM2 或 systemd 启动 `npm run start`，配 Nginx 反向代理和 HTTPS。
- LLM 直接接现有 OpenAI 兼容服务，不额外自建模型层。

这套方案的优点是：

- 成本最低。
- 部署最简单。
- 与当前代码改动最少。

需要接受的边界是：

- 更适合两人长期低频使用，不适合多人高并发。
- 上传文件和数据库都还是单机持久化，需要自己做备份。
- 后续如果用户数明显增长，再迁移到 Postgres 和对象存储会更合适。

## 项目文档

- [产品需求文档](docs/product-requirements.md)
- [技术文档](docs/technical-design.md)
- [开发文档](docs/development-guide.md)
- [上线指南](docs/deployment-guide.md)
- [当前进度与后续计划](docs/progress-and-roadmap.md)
