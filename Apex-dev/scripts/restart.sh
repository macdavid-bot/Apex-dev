#!/bin/bash

set -e

echo "Restarting Apex Dev..."
pm2 restart apex-dev

echo "Restart completed."
