module.exports = {
  apps: [{
    name: 'test-platform-api',
    script: 'dist/main.js',
    env: { NODE_ENV: 'production' },
    env_file: '.env',
  }],
};
