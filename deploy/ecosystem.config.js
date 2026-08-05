// PM2 process definition for mcp-brevo.
// Adjust `cwd` to the actual deploy directory. The app reads .env from cwd,
// and writes its SQLite database (data.db) there too — keep it persistent.
//
//   pm2 start deploy/ecosystem.config.js
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "mcp-brevo",
      script: "build/server.js",
      cwd: "/opt/mcp-brevo",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
