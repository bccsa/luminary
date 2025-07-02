#!/bin/sh
set -e

if [ "$ENABLE_GZIP" = "false" ]; then
  sed 's/__GZIP_DIRECTIVE__/gzip off;/' /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
else
  sed 's/__GZIP_DIRECTIVE__/gzip on;/' /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'