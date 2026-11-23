# SPEC-FE-01 D10: one image per app (APP=grower-web | staff-console), built from apps/$APP/dist (pnpm build first).
# Configuration only at runtime (environment variables → /config.json and the nginx site), never baked in.
FROM nginx:1.31-alpine
ARG APP
COPY docker/site.conf.template /etc/nginx/gc/site.conf.template
COPY docker/headers.conf.template /etc/nginx/gc/headers.conf.template
COPY --chmod=0755 docker/40-growercare-config.sh /docker-entrypoint.d/40-growercare-config.sh
COPY apps/${APP}/dist /usr/share/nginx/html
RUN rm -f /etc/nginx/conf.d/default.conf /usr/share/nginx/html/config.json
EXPOSE 8080
