FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./
ARG PROBE_VERSION=dev
ARG PROBE_BROKEN=0
ENV PROBE_VERSION=$PROBE_VERSION PROBE_BROKEN=$PROBE_BROKEN
LABEL org.opencontainers.image.source=https://github.com/irma-AI/Temp
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.mjs"]
