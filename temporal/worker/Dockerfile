FROM node:20-alpine AS build
WORKDIR /workspace

COPY event-bus/event-sdk ./event-bus/event-sdk
COPY observability/telemetry-sdk ./observability/telemetry-sdk
COPY temporal ./temporal

WORKDIR /workspace/temporal/worker
RUN npm ci
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /workspace
ENV NODE_ENV=production

COPY event-bus/event-sdk ./event-bus/event-sdk
COPY observability/telemetry-sdk ./observability/telemetry-sdk
COPY temporal ./temporal

WORKDIR /workspace/temporal/worker
RUN npm ci --omit=dev
COPY --from=build /workspace/temporal/worker/dist ./dist

EXPOSE 7200
CMD ["node", "dist/src/index.js"]
