// PM2 ecosystem config — production process manager
// Usage: pm2 start deploy/ecosystem.config.cjs --env production
// pm2 save && pm2 startup systemd

module.exports = {
  apps: [
    {
      name:           'apex-api',
      script:         'apps/api/src/index.js',
      interpreter:    'node',
      interpreter_args: '--experimental-vm-modules',
      cwd:            '/var/www/apex-dev',
      env_production: {
        NODE_ENV: 'production',
        PORT:     '3000',
        HOST:     '127.0.0.1',
      },
      // Process management
      instances:       1,
      exec_mode:       'fork',
      autorestart:     true,
      watch:           false,
      max_memory_restart: '512M',
      restart_delay:   3000,
      max_restarts:    10,
      // Logging
      out_file:        '/var/log/apex-dev/api-out.log',
      error_file:      '/var/log/apex-dev/api-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:      true,
    }
  ]
};
