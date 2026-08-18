FROM node:lts-alpine as build-stage

# Build the shared library
WORKDIR /shared
COPY ./shared ./
RUN npm ci
RUN npm run build

# Build the encoder's player libraries. They ship only dist/, and app depends on
# player-web-legacy by path (file:../media-convert/player-web-legacy), so this
# has to happen before app installs. The submodule's own workspace links resolve
# player-core and hls-core underneath it.
WORKDIR /media-convert
COPY ./media-convert ./
RUN npm ci
RUN npm run build:libs

# Build the app
WORKDIR /app
COPY ./app/package*.json ./
RUN npm ci
COPY ./app .
RUN npm run build

FROM nginx:stable-alpine as production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY --from=build-stage /app/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY ./app/scripts/setup-nginxvars.sh /setup-nginxvars.sh
RUN chmod +x /setup-nginxvars.sh
EXPOSE 80
ENTRYPOINT ["/setup-nginxvars.sh"]
