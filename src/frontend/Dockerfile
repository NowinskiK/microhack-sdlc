FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY --from=builder /app/public/* /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh

RUN chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod +x /entrypoint.sh

ENV API_HOST=api
ENV API_PORT=443
ENV API_PROTOCOL=https
ENV API_RESOLVER=127.0.0.11

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
