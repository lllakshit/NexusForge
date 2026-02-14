import { connect, consumerOpts, createInbox, JSONCodec, JsMsg, NatsConnection, StringCodec } from "nats";
import { randomUUID } from "node:crypto";
import { CoreEventType, EventEnvelope, EventPublishOptions, EventSubscriptionHandler } from "./types";

const jsonCodec = JSONCodec<EventEnvelope>();
const stringCodec = StringCodec();

const toSubject = (eventType: CoreEventType): string => `nexusforge.${eventType.replace(/\./g, ".")}`;

export class EventBusClient {
  private nc?: NatsConnection;
  private readonly natsUrl: string;
  private readonly streamName: string;
  private readonly sourceService: string;

  constructor(params: { natsUrl: string; streamName?: string; sourceService: string }) {
    this.natsUrl = params.natsUrl;
    this.streamName = params.streamName ?? "NEXUSFORGE_EVENTS";
    this.sourceService = params.sourceService;
  }

  async connect(): Promise<void> {
    if (this.nc) {
      return;
    }

    this.nc = await connect({ servers: this.natsUrl });
    const jsm = await this.nc.jetstreamManager();

    try {
      await jsm.streams.info(this.streamName);
    } catch {
      await jsm.streams.add({
        name: this.streamName,
        subjects: ["nexusforge.>"]
      });
    }
  }

  async publish<T extends Record<string, unknown>>(
    eventType: CoreEventType,
    data: T,
    options: EventPublishOptions
  ): Promise<void> {
    if (!this.nc) {
      await this.connect();
    }

    const payload: EventEnvelope<T> = {
      id: randomUUID(),
      type: eventType,
      source: this.sourceService,
      time: new Date().toISOString(),
      correlationId: options.correlationId,
      traceId: options.traceId,
      spanId: options.spanId,
      data
    };

    const subject = toSubject(eventType);
    this.nc?.publish(subject, jsonCodec.encode(payload));
  }

  async subscribe<T extends Record<string, unknown>>(
    eventType: CoreEventType,
    durableName: string,
    handler: EventSubscriptionHandler<T>
  ): Promise<void> {
    if (!this.nc) {
      await this.connect();
    }

    const js = this.nc!.jetstream();
    const opts = consumerOpts();
    opts.durable(durableName);
    opts.manualAck();
    opts.ackExplicit();
    opts.deliverTo(createInbox());

    const sub = await js.subscribe(toSubject(eventType), opts);

    (async () => {
      for await (const message of sub) {
        await this.handleMessage<T>(message, handler);
      }
    })().catch((error) => {
      console.error(`[event-sdk] subscription error for ${eventType}:`, error);
    });
  }

  async request(subject: string, payload: Record<string, unknown>, timeout = 3000): Promise<string> {
    if (!this.nc) {
      await this.connect();
    }
    const response = await this.nc!.request(subject, stringCodec.encode(JSON.stringify(payload)), { timeout });
    return stringCodec.decode(response.data);
  }

  async close(): Promise<void> {
    await this.nc?.drain();
    this.nc = undefined;
  }

  private async handleMessage<T extends Record<string, unknown>>(message: JsMsg, handler: EventSubscriptionHandler<T>) {
    try {
      const event = jsonCodec.decode(message.data) as EventEnvelope<T>;
      await handler(event);
      message.ack();
    } catch (error) {
      console.error("[event-sdk] failed to process event", error);
      message.nak();
    }
  }
}
