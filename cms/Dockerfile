FROM node:lts-alpine as build-stage
# Build the shared library
WORKDIR /shared
COPY ./shared ./
RUN npm ci
RUN npm run build

# Comment
WORKDIR /cms
COPY ./cms/package*.json ./
RUN npm ci --install-links
COPY ./cms .
RUN npm run build

FROM nginx:stable-alpine as production-stage
COPY --from=build-stage /cms/dist /usr/share/nginx/html
COPY --from=build-stage /cms/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
