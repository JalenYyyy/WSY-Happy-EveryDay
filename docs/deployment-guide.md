# 小月天天开心上线指南

这份文档只覆盖当前阶段最推荐的上线方式：

- 目标：尽快上线试用
- 原则：成本低、部署简单、尽量少改代码
- 适用场景：两位固定用户长期低频使用

如果你想直接按命令执行，可以配合 [docs/linux-deploy-commands.md](docs/linux-deploy-commands.md) 一起使用。

如果目标平台是阿里云，也可以直接看 [docs/alicloud-checklist.md](docs/alicloud-checklist.md)。

## 1. 推荐方案

建议使用：

- 1 台 Linux 云主机
- Node.js 22+
- Nginx
- PM2 或 systemd
- 当前仓库自带的 SQLite
- 主机本地持久化目录保存数据库和上传文件

不建议当前阶段就做的事：

- 不要为了“更正规”立刻迁移 Postgres
- 不要第一阶段就接对象存储
- 不要把 Windows 当正式部署环境
- 不要先引入 Docker、K8s、CI/CD 再上线

原因很简单：当前用户规模很小，复杂度上升带来的维护成本，大于短期收益。

## 2. 服务器准备

建议最低配置：

- 2 vCPU
- 2 GB RAM
- 40 GB SSD
- Ubuntu 22.04 LTS 或同级 Linux 发行版

先安装：

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

确认版本：

```bash
node -v
npm -v
pm2 -v
```

## 3. 目录规划

推荐把项目和持久化数据拆开：

```text
/var/www/wsy-happy-everyday/app        # 项目代码
/var/www/wsy-happy-everyday/data       # SQLite 和上传文件持久化目录
/var/www/wsy-happy-everyday/backups    # 备份目录
```

初始化目录：

```bash
sudo mkdir -p /var/www/wsy-happy-everyday/app
sudo mkdir -p /var/www/wsy-happy-everyday/data
sudo mkdir -p /var/www/wsy-happy-everyday/backups
sudo chown -R $USER:$USER /var/www/wsy-happy-everyday
```

## 4. 部署代码

把代码放到应用目录后执行：

```bash
cd /var/www/wsy-happy-everyday/app
npm install
npx prisma generate
npm run db:push
npm run db:seed
npm run build
```

如果不是首次上线，`db:seed` 先确认是否还需要执行，避免误覆盖默认数据策略。

## 5. 持久化处理

当前项目有两类必须持久化的数据：

- SQLite 数据库
- `public/uploads/` 里的上传文件

推荐最低成本做法：

- 把数据库文件和上传目录放到 `/var/www/wsy-happy-everyday/data`
- 用软链接把运行目录接过去

示例：

```bash
mkdir -p /var/www/wsy-happy-everyday/data/sqlite
mkdir -p /var/www/wsy-happy-everyday/data/uploads

rm -rf prisma/dev.db
rm -rf public/uploads

mkdir -p /var/www/wsy-happy-everyday/data/uploads
touch /var/www/wsy-happy-everyday/data/sqlite/dev.db

ln -s /var/www/wsy-happy-everyday/data/sqlite/dev.db prisma/dev.db
ln -s /var/www/wsy-happy-everyday/data/uploads public/uploads
```

如果你的部署目录结构不同，原则不变：

- 运行代码目录可以被覆盖
- 数据目录不能跟着发布一起被覆盖

## 6. 环境变量

生产环境至少需要：

```bash
DATABASE_URL="file:./dev.db"
APP_SESSION_SECRET="换成你自己的长随机字符串"
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="你的 key"
LLM_MODEL="deepseek-v4-pro"
```

建议把 `.env` 放在应用目录，并确保：

- `APP_SESSION_SECRET` 不使用开发默认值
- 默认密码上线后尽快改掉
- 如果暂时不接大模型，也可以先留空 LLM 配置，系统会走备用回复

## 7. 启动方式

推荐先用 PM2，最省事。

仓库里已经提供了可直接修改的 PM2 模板文件：[ecosystem.config.js](../ecosystem.config.js)。

```bash
cd /var/www/wsy-happy-everyday/app
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

检查状态：

```bash
pm2 status
pm2 logs wsy-happy-everyday
```

如果更偏传统运维，也可以用 systemd，但当前阶段 PM2 更省事。

## 8. Nginx 反向代理

假设应用监听 `127.0.0.1:3000`，可使用以下基础配置：

仓库里也提供了 Nginx 示例文件：[docs/nginx.conf.example](docs/nginx.conf.example)。

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用后重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

再用 Let’s Encrypt 配 HTTPS 即可。

## 9. 上线前最后检查

按 [docs/development-guide.md](docs/development-guide.md#L219) 的上线前检查清单走一遍，至少确认：

- 可以登录和退出
- 改密码后旧会话失效
- 发送文字和图片都正常
- 猫圈删除会一起清理图片
- 悄悄话可创建、查看、删除
- 高频发送和高频创建悄悄话会返回 429

## 10. 最低成本备份

当前阶段建议直接备份两样东西：

- SQLite 数据库文件
- `public/uploads/` 对应的数据目录

最简单做法是每天定时打包：

```bash
tar -czf /var/www/wsy-happy-everyday/backups/uploads-$(date +%F).tar.gz /var/www/wsy-happy-everyday/data/uploads
cp /var/www/wsy-happy-everyday/data/sqlite/dev.db /var/www/wsy-happy-everyday/backups/dev-$(date +%F).db
```

上线早期，这样就够用。等后续确认使用稳定，再升级成对象存储备份或更完整的数据库备份策略。

## 11. 当前阶段不必做的优化

下面这些方向是后续增强项，不是当前低成本上线的必需品：

- Postgres
- Prisma Migration 正式化
- 对象存储
- Docker 化
- 自动化 CI/CD
- 多机部署
- 流式回复
- 多模型后台管理

当前目标应该是：

- 先稳定上线
- 先能长期可用
- 先把备份和持久化做好

这比过早追求“架构完整”更划算。