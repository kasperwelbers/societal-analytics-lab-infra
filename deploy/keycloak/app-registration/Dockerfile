# App registration site (see docs/app-registration.md)
FROM node:24.22.3-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/server.js"]
