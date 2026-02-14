export type CoreEventType =
  | "user.created"
  | "project.created"
  | "project.deleted"
  | "job.created"
  | "job.completed"
  | "file.uploaded"
  | "incident.detected"
  | "incident.remediated"
  | "service.registered";

export type EventEnvelope<T = Record<string, unknown>> = {
  id: string;
  type: CoreEventType;
  source: string;
  time: string;
  correlationId: string;
  traceId?: string;
  spanId?: string;
  data: T;
};

export type EventPublishOptions = {
  correlationId: string;
  traceId?: string;
  spanId?: string;
};

export type EventSubscriptionHandler<T = Record<string, unknown>> = (event: EventEnvelope<T>) => Promise<void> | void;
