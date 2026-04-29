#!/usr/bin/with-contenv bashio
set -e

mkdir -p /data
cd /app/backend

exec node server.js
