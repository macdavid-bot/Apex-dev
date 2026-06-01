module.exports = {
  apps: [
    {
      name: 'apex-dev',
      script: 'apps/api/src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
