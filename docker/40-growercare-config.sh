#!/bin/sh
# SPEC-FE-01 D4/D10: writes /config.json and the nginx site from the environment at container start.
#   OIDC_AUTHORITY   Keycloak realm URL as the browser reaches it, e.g. http://localhost:8180/realms/growercare (required)
#   OIDC_CLIENT_ID   grower-web | staff-console (required)
#   API_UPSTREAM     the edge gateway as nginx reaches it, e.g. http://gc-edge:8080 (required)
#   CONNECT_EXTRA    further origins the browser may call, e.g. the object store for presigned uploads (optional)
set -eu
: "${OIDC_AUTHORITY:?OIDC_AUTHORITY is required}"
: "${OIDC_CLIENT_ID:?OIDC_CLIENT_ID is required}"
: "${API_UPSTREAM:?API_UPSTREAM is required}"
CONNECT_EXTRA="${CONNECT_EXTRA:-}"
OIDC_ORIGIN=$(printf '%s' "$OIDC_AUTHORITY" | sed -E 's#^(https?://[^/]+).*#\1#')
export API_UPSTREAM OIDC_ORIGIN CONNECT_EXTRA

printf '{"oidcAuthority":"%s","oidcClientId":"%s","apiBase":"/api"}\n' "$OIDC_AUTHORITY" "$OIDC_CLIENT_ID" \
  > /usr/share/nginx/html/config.json
# only our variables are substituted; nginx's own ($uri, $host, …) stay as they are
envsubst '${OIDC_ORIGIN} ${CONNECT_EXTRA}' < /etc/nginx/gc/headers.conf.template > /etc/nginx/gc/headers.conf
envsubst '${API_UPSTREAM}' < /etc/nginx/gc/site.conf.template > /etc/nginx/conf.d/growercare.conf
echo "growercare: config.json for $OIDC_CLIENT_ID, API via $API_UPSTREAM"
