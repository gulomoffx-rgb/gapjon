FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY webapp ./webapp
ENV NODE_ENV=production PORT=8080
VOLUME ["/app/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "--no-warnings", "server/server.js"]
