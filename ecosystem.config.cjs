// PM2 process file — uses CommonJS (cjs) because PM2 loads configs via require()
// even when the project has "type":"module" in package.json.
module.exports = {
  apps: [
    {
      name: 'apex-dev-api',
      script: 'apps/api/src/index.js',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0'
      }
    }
  ]
};
