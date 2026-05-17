module.exports = {
  apps: [
    {
      name: "wsy-happy-everyday",
      cwd: "/var/www/wsy-happy-everyday/app",
      script: "npm",
      args: "run start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};