FROM node:lts-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Explicitly verify and copy design docs if build didn't include them
RUN mkdir -p dist/src/db/designDocs && \
    cp -r src/db/designDocs/*.json dist/src/db/designDocs/ 2>/dev/null || true
# Verify files exist
RUN test $(ls -1 dist/src/db/designDocs/*.json 2>/dev/null | wc -l) -gt 0 || (echo "✗ ERROR: No design docs found!" && exit 1)
CMD [ "npm", "run", "start:prod" ]
