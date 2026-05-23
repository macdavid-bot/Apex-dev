#!/bin/bash

set -e

echo "Installing dependencies..."
pnpm install

echo "Building application..."
pnpm build

echo "Starting PM2 runtime..."
pm2 start ecosystem.config.js

echo "Deployment completed successfully."
