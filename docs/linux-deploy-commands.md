# Linux 部署命令清单

这份清单对应当前最推荐的低成本上线方式：

- 单台 Linux 云主机
- Node.js + Next.js
- SQLite 持久化
- 上传目录持久化
- PM2 + Nginx

以下命令默认以 Ubuntu 22.04 为例。

## 1. 安装运行环境

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

node -v
npm -v
pm2 -v
```

## 2. 创建目录

```bash
sudo mkdir -p /var/www/wsy-happy-everyday/app
sudo mkdir -p /var/www/wsy-happy-everyday/data/sqlite
sudo mkdir -p /var/www/wsy-happy-everyday/data/uploads
sudo mkdir -p /var/www/wsy-happy-everyday/backups
sudo chown -R $USER:$USER /var/www/wsy-happy-everyday
```

## 3. 上传代码后安装依赖

```bash
cd /var/www/wsy-happy-everyday/app
npm install
npx prisma generate
```

## 4. 配置环境变量

在应用目录创建 `.env`：

```bash
cat > /var/www/wsy-happy-everyday/app/.env <<'EOF'
DATABASE_URL="file:./dev.db"
APP_SESSION_SECRET="请替换成你的长随机字符串"
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="请替换成你的实际 key"
LLM_MODEL="deepseek-chat"
EOF
```

如果暂时不接真实模型，可以先把 LLM 三项留空。

## 5. 配置持久化

```bash
cd /var/www/wsy-happy-everyday/app

rm -f prisma/dev.db
rm -rf public/uploads

touch /var/www/wsy-happy-everyday/data/sqlite/dev.db
ln -s /var/www/wsy-happy-everyday/data/sqlite/dev.db prisma/dev.db
ln -s /var/www/wsy-happy-everyday/data/uploads public/uploads
```

## 6. 初始化数据库并构建

```bash
cd /var/www/wsy-happy-everyday/app
npm run db:push
npm run db:seed
npm run build
```

如果不是首次上线，执行 `npm run db:seed` 前先确认是否还需要写入默认数据。

## 7. 使用 PM2 启动

```bash
cd /var/www/wsy-happy-everyday/app
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

检查运行状态：

```bash
pm2 status
pm2 logs wsy-happy-everyday
```

## 8. 配置 Nginx

复制示例配置：

```bash
sudo cp /var/www/wsy-happy-everyday/app/docs/nginx.conf.example /etc/nginx/sites-available/wsy-happy-everyday
```

编辑域名：

```bash
sudo nano /etc/nginx/sites-available/wsy-happy-everyday
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/wsy-happy-everyday /etc/nginx/sites-enabled/wsy-happy-everyday
sudo nginx -t
sudo systemctl reload nginx
```

## 9. 开启 HTTPS

如果域名已经解析到服务器：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 10. 上线后验证

至少执行：

```bash
curl -I http://127.0.0.1:3000
pm2 status
pm2 logs wsy-happy-everyday --lines 100
```

然后再按 [docs/development-guide.md](docs/development-guide.md#L219) 的上线前检查清单，用浏览器完整走一遍登录、改密、聊天、图片、猫圈、悄悄话流程。

## 11. 最低成本备份命令

```bash
cp /var/www/wsy-happy-everyday/data/sqlite/dev.db /var/www/wsy-happy-everyday/backups/dev-$(date +%F).db
tar -czf /var/www/wsy-happy-everyday/backups/uploads-$(date +%F).tar.gz /var/www/wsy-happy-everyday/data/uploads
```

如果要做成每日定时任务，再把这两行放进 crontab 即可。