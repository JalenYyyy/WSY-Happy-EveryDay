# 猫咪小家

一个两人共享的猫咪聊天 Web/PWA MVP。五只默认猫咪接入 OpenAI 兼容大模型接口，支持猫咪性格、语气、背景故事、头像和专属称呼配置。

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

## 大模型配置

在 `.env` 中配置 OpenAI 兼容接口：

```bash
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="你的 API Key"
LLM_MODEL="deepseek-chat"
```

未配置模型时，应用会使用本地备用回复并在界面提示。

## 常用命令

```bash
npm run dev      # 开发服务
npm run build    # 生产构建
npm run db:push  # 同步数据库结构
npm run db:seed  # 写入默认用户和猫咪
npm run db:reset # 重置本地数据库并重新 seed
```

## 项目文档

- [产品需求文档](docs/product-requirements.md)
- [技术文档](docs/technical-design.md)
- [开发文档](docs/development-guide.md)
- [当前进度与后续计划](docs/progress-and-roadmap.md)
