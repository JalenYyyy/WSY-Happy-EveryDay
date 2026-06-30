# 小月天天开心阿里云 ECS 部署手册

这份文档按 **阿里云 ECS 实操顺序** 编写，目标是让当前项目以 **最低改动、最低复杂度** 上线：

- 运行环境：**阿里云 ECS + Ubuntu 22.04**
- 部署方式：**Node.js 22 + PM2 + Nginx**
- 数据库：**SQLite**
- 文件存储：**ECS 本地持久化目录**
- 适用场景：**两位固定用户、低频长期私人使用**

本文默认：

- ECS 公网 IP：`你的ECS公网IP`
- 域名：`你的域名`（没有域名时可先用公网 IP）
- 项目根目录：`/var/www/wsy-happy-everyday`
- 代码目录：`/var/www/wsy-happy-everyday/app`
- 数据目录：`/var/www/wsy-happy-everyday/data`
- 上传目录：`/var/www/wsy-happy-everyday/uploads`
- 备份目录：`/var/www/wsy-happy-everyday/backups`

---

## 1. 阿里云控制台准备

### 1.1 创建 ECS

推荐配置：

- 2 vCPU
- 2 GB RAM
- 40 GB SSD
- Ubuntu 22.04 LTS
- 公网 IP

### 1.2 配置安全组

放行：

- `22`：你的管理 IP
- `80`：全网
- `443`：全网

不要放行：

- `3000`

### 1.3 域名解析

如果你有域名：

- 添加 `A` 记录
- 指向 ECS 公网 IP

---

## 2. 登录 ECS

```bash
ssh root@你的ECS公网IP
```

如果你用普通用户，也可以把下面命令里的 `sudo` 保留照执行。

---

## 3. 安装系统依赖

```bash
sudo apt update
sudo apt install -y nginx git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

检查版本：

```bash
node -v
npm -v
pm2 -v
nginx -v
```

---

## 4. 创建目录

```bash
sudo mkdir -p /var/www/wsy-happy-everyday/{app,data,uploads,logs,backups}
sudo chown -R $USER:$USER /var/www/wsy-happy-everyday
```

检查目录：

```bash
ls -lah /var/www/wsy-happy-everyday
```

---

## 5. 拉代码

如果用 Git：

```bash
cd /var/www/wsy-happy-everyday
git clone 你的仓库地址 app
cd /var/www/wsy-happy-everyday/app
```

例如：

```bash
cd /var/www/wsy-happy-everyday
git clone https://github.com/你的用户名/WSY-Happy-EveryDay.git app
cd /var/www/wsy-happy-everyday/app
```

---

## 6. 安装项目依赖

优先：

```bash
npm ci
```

如果失败，再执行：

```bash
npm install
```

---

## 7. 创建生产环境变量

在 `/var/www/wsy-happy-everyday/app/.env` 写入：

```bash
cat > /var/www/wsy-happy-everyday/app/.env <<'EOF'
DATABASE_URL="file:/var/www/wsy-happy-everyday/data/prod.db"
APP_SESSION_SECRET="替换成你自己的长随机字符串"
ADMIN_RESET_PASSWORD=""
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="替换成你的大模型 API Key"
LLM_MODEL="deepseek-chat"
TAVILY_API_KEY=""
NODE_ENV="production"
EOF
```

### 7.1 生产 `.env` 模板说明

- `DATABASE_URL`：直接指向 ECS 持久化目录中的 SQLite 文件
- `APP_SESSION_SECRET`：必须替换成自己的随机值
- `ADMIN_RESET_PASSWORD`：如果不需要管理员密码重置，保持空字符串
- `LLM_API_KEY`：必填，否则聊天会走本地备用回复
- `LLM_MODEL`：建议使用你实际可用的模型名，不要照抄无效名称

### 7.2 生成随机密钥

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

把输出替换进：

```bash
APP_SESSION_SECRET="这里替换成随机值"
```

### 7.3 查看确认

```bash
cat /var/www/wsy-happy-everyday/app/.env
```

---

## 8. 准备持久化上传目录

当前项目上传路径使用 `public/uploads/...`，正式上线时需要把它挂到 ECS 持久化目录。

先创建真实上传目录：

```bash
mkdir -p /var/www/wsy-happy-everyday/uploads/cats
mkdir -p /var/www/wsy-happy-everyday/uploads/users
```

再把运行目录里的 `public/uploads` 改成软链接：

```bash
cd /var/www/wsy-happy-everyday/app/public
rm -rf uploads
ln -s /var/www/wsy-happy-everyday/uploads uploads
```

检查结果：

```bash
ls -lah /var/www/wsy-happy-everyday/app/public
```

你应看到类似：

```text
uploads -> /var/www/wsy-happy-everyday/uploads
```

---

## 9. 初始化数据库

首次上线执行：

```bash
cd /var/www/wsy-happy-everyday/app
npm run db:push
npm run db:seed
```

检查数据库文件：

```bash
ls -lh /var/www/wsy-happy-everyday/data
```

如果看到了 `prod.db`，说明数据库已落到持久化目录。

---

## 10. 生产构建

```bash
cd /var/www/wsy-happy-everyday/app
npm run build
```

如果这里报错，不要继续上线，先修构建问题。

---

## 11. 用 PM2 启动应用

仓库里已经有 `ecosystem.config.js`，当前目录结构与它匹配，可直接使用。

启动：

```bash
cd /var/www/wsy-happy-everyday/app
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

查看进程状态：

```bash
pm2 status
pm2 logs wsy-happy-everyday --lines 100
```

本机测试：

```bash
curl http://127.0.0.1:3000/login
```

---

## 12. 配置 Nginx 反向代理

创建站点配置：

```bash
sudo tee /etc/nginx/sites-available/wsy-happy-everyday > /dev/null <<'EOF'
server {
    listen 80;
    server_name 你的域名 你的ECS公网IP;

    client_max_body_size 20m;

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
EOF
```

启用站点：

```bash
sudo ln -sf /etc/nginx/sites-available/wsy-happy-everyday /etc/nginx/sites-enabled/wsy-happy-everyday
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 13. 浏览器验证

访问：

```text
http://你的域名
```

或：

```text
http://你的ECS公网IP
```

至少验证：

1. 登录页能打开
2. 用户列表正常显示
3. `user1 / cat123` 可登录
4. `user2 / cat123` 可登录
5. 忘记密码弹窗能打开
6. 修改密码弹窗能打开
7. 文字聊天正常
8. 图片上传正常
9. 刷新页面后数据仍存在

---

## 14. HTTPS（有域名时）

安装 certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
```

申请证书：

```bash
sudo certbot --nginx -d 你的域名
```

测试自动续期：

```bash
sudo certbot renew --dry-run
```

---

## 15. 首次上线后立刻执行的操作

登录系统后建议马上做：

1. 修改默认账号密码
2. 为两个用户都生成恢复码并保存
3. 如果不需要管理员密码重置，确认：

```bash
grep ADMIN_RESET_PASSWORD /var/www/wsy-happy-everyday/app/.env
```

应保持为空：

```bash
ADMIN_RESET_PASSWORD=""
```

---

## 16. 可选：先屏蔽 Pi Agent 对外入口

如果你暂时不想开放 `/agent` 和 `/api/pi`，可以直接在 Nginx 里屏蔽。

编辑配置：

```bash
sudo nano /etc/nginx/sites-available/wsy-happy-everyday
```

在 `server { ... }` 里加入：

```nginx
location /agent {
    return 403;
}

location /api/pi/ {
    return 403;
}
```

保存后重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 17. 备份脚本

创建备份脚本：

```bash
cat > /var/www/wsy-happy-everyday/backup.sh <<'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/var/www/wsy-happy-everyday/backups"
DATE=$(date +%F-%H%M%S)

tar -czf "$BACKUP_DIR/backup-$DATE.tar.gz" \
  /var/www/wsy-happy-everyday/data \
  /var/www/wsy-happy-everyday/uploads
EOF
```

加执行权限：

```bash
chmod +x /var/www/wsy-happy-everyday/backup.sh
```

手动执行一次：

```bash
/var/www/wsy-happy-everyday/backup.sh
ls -lh /var/www/wsy-happy-everyday/backups
```

---

## 18. 设置定时备份

编辑 crontab：

```bash
crontab -e
```

加入：

```bash
0 3 * * * /var/www/wsy-happy-everyday/backup.sh
```

表示每天凌晨 3 点自动备份。

---

## 19. 日常发版更新流程

以后更新版本执行：

```bash
cd /var/www/wsy-happy-everyday/app
git pull
npm ci
npm run db:push
npm run build
pm2 restart wsy-happy-everyday
```

注意：

- 普通发版 **不要每次都跑 `npm run db:seed`**
- 只有你明确需要补默认数据时才跑 seed

---

## 20. 回滚流程

如果新版本有问题：

```bash
cd /var/www/wsy-happy-everyday/app
git log --oneline -n 5
git checkout 旧提交ID
npm ci
npm run build
pm2 restart wsy-happy-everyday
```

---

## 21. 常用排查命令

### 查看 PM2 日志

```bash
pm2 logs wsy-happy-everyday --lines 200
```

### 查看 Nginx 日志

```bash
tail -n 200 /var/log/nginx/error.log
tail -n 200 /var/log/nginx/access.log
```

### 查看端口

```bash
ss -ltnp | grep 3000
ss -ltnp | grep 80
ss -ltnp | grep 443
```

### 查看服务状态

```bash
pm2 status
systemctl status nginx
```

---

## 22. 最短可执行版

如果你想一口气照着执行，顺序如下。

### 22.1 安装系统依赖

```bash
sudo apt update
sudo apt install -y nginx git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 22.2 准备目录

```bash
sudo mkdir -p /var/www/wsy-happy-everyday/{app,data,uploads,logs,backups}
sudo chown -R $USER:$USER /var/www/wsy-happy-everyday
```

### 22.3 拉代码并安装依赖

```bash
cd /var/www/wsy-happy-everyday
git clone 你的仓库地址 app
cd app
npm ci
```

### 22.4 写 `.env`

```bash
cat > /var/www/wsy-happy-everyday/app/.env <<'EOF'
DATABASE_URL="file:/var/www/wsy-happy-everyday/data/prod.db"
APP_SESSION_SECRET="替换成随机字符串"
ADMIN_RESET_PASSWORD=""
LLM_BASE_URL="https://api.deepseek.com"
LLM_API_KEY="替换成你的 key"
LLM_MODEL="deepseek-chat"
TAVILY_API_KEY=""
NODE_ENV="production"
EOF
```

### 22.5 上传目录持久化

```bash
mkdir -p /var/www/wsy-happy-everyday/uploads/cats
mkdir -p /var/www/wsy-happy-everyday/uploads/users
cd /var/www/wsy-happy-everyday/app/public
rm -rf uploads
ln -s /var/www/wsy-happy-everyday/uploads uploads
```

### 22.6 初始化并构建

```bash
cd /var/www/wsy-happy-everyday/app
npm run db:push
npm run db:seed
npm run build
```

### 22.7 启动

```bash
cd /var/www/wsy-happy-everyday/app
pm2 start ecosystem.config.js
pm2 save
```

### 22.8 配 Nginx

```bash
sudo tee /etc/nginx/sites-available/wsy-happy-everyday > /dev/null <<'EOF'
server {
    listen 80;
    server_name 你的域名 你的ECS公网IP;
    client_max_body_size 20m;

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
EOF

sudo ln -sf /etc/nginx/sites-available/wsy-happy-everyday /etc/nginx/sites-enabled/wsy-happy-everyday
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 23. 当前项目上线建议

当前阶段最实用的上线策略就是：

1. 单台 ECS
2. SQLite 单机持久化
3. 本地上传目录持久化
4. PM2 托管
5. Nginx + HTTPS
6. 每天自动备份

这套方案最适合你现在的项目体量和使用方式。
