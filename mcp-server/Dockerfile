FROM node:20-alpine AS build
WORKDIR /workspace

COPY event-bus/event-sdk ./event-bus/event-sdk
COPY observability/telemetry-sdk ./observability/telemetry-sdk
COPY mcp-server ./mcp-server

WORKDIR /workspace/mcp-server
RUN npm ci
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /workspace
ENV NODE_ENV=production

COPY event-bus/event-sdk ./event-bus/event-sdk
COPY observability/telemetry-sdk ./observability/telemetry-sdk
COPY mcp-server ./mcp-server

WORKDIR /workspace/mcp-server
RUN npm ci --omit=dev
COPY --from=build /workspace/mcp-server/dist ./dist

EXPOSE 4005
CMD ["node", "dist/index.js"]
