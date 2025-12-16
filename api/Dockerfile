FROM node:lts-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm run seed
CMD [ "npm", "run", "start:prod" ]
