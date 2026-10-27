#!/bin/sh

API_HOST=${API_HOST:-api}
API_PORT=${API_PORT:-443}
API_PROTOCOL=${API_PROTOCOL:-https}
API_RESOLVER=${API_RESOLVER:-127.0.0.11}
export API_HOST API_PORT API_PROTOCOL API_RESOLVER

envsubst '${API_HOST} ${API_PORT} ${API_PROTOCOL} ${API_RESOLVER}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

cat > /usr/share/nginx/html/runtime-config.js <<'EOF'
window.RUNTIME_CONFIG = {
  API_URL: window.location.origin
};
EOF

exec nginx -g "daemon off;"