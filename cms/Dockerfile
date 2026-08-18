FROM node:lts-alpine as build-stage

# Build the shared library
WORKDIR /shared
COPY ./shared ./
RUN npm ci
RUN npm run build

# Build the encoder's player libraries. They ship only dist/, and cms depends on
# player-web-legacy by path (file:../media-convert/player-web-legacy), so this
# has to happen before cms installs. The submodule's own workspace links resolve
# player-core and hls-core underneath it.
WORKDIR /media-convert
COPY ./media-convert ./
RUN npm ci
RUN npm run build:libs

# Build the CMS
WORKDIR /cms
COPY ./cms/package*.json ./
RUN npm ci
COPY ./cms .
RUN npm run build

FROM nginx:stable-alpine as production-stage
COPY --from=build-stage /cms/dist /usr/share/nginx/html
COPY --from=build-stage /cms/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY ./cms/scripts/setup-nginxvars.sh /setup-nginxvars.sh
RUN chmod +x /setup-nginxvars.sh
EXPOSE 80
ENTRYPOINT ["/setup-nginxvars.sh"]
