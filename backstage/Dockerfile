FROM node:20-alpine AS build
WORKDIR /workspace

COPY event-bus/event-sdk ./event-bus/event-sdk
COPY observability/telemetry-sdk ./observability/telemetry-sdk
COPY backstage ./backstage

WORKDIR /workspace/backstage
RUN npm ci
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /workspace
ENV NODE_ENV=production

COPY event-bus/event-sdk ./event-bus/event-sdk
COPY observability/telemetry-sdk ./observability/telemetry-sdk
COPY backstage ./backstage

WORKDIR /workspace/backstage
RUN npm ci --omit=dev
COPY --from=build /workspace/backstage/dist ./dist

EXPOSE 7007
CMD ["node", "dist/index.js"]
