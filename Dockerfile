FROM node:22-alpine
ENV NODE_ENV=production TZ=America/Sao_Paulo
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY config ./config
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/index.js"]
