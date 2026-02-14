import { context, trace } from "@opentelemetry/api";
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export type RequestContext = {
  correlationId: string;
  traceId: string;
  spanId: string;
};

export const resolveRequestContext = (): RequestContext => {
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();
  return {
    correlationId: "",
    traceId: spanContext?.traceId ?? "unknown",
    spanId: spanContext?.spanId ?? "unknown"
  };
};

export const correlationMiddleware = (serviceName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incomingCorrelation = req.header("x-correlation-id");
    const correlationId = incomingCorrelation && incomingCorrelation.trim().length > 0 ? incomingCorrelation : randomUUID();

    res.setHeader("x-correlation-id", correlationId);
    res.locals.correlationId = correlationId;

    const traceContext = resolveRequestContext();
    res.locals.traceId = traceContext.traceId;
    res.locals.spanId = traceContext.spanId;

    console.log(
      JSON.stringify({
        level: "info",
        service: serviceName,
        method: req.method,
        path: req.originalUrl,
        correlation_id: correlationId,
        trace_id: traceContext.traceId,
        span_id: traceContext.spanId,
        time: new Date().toISOString()
      })
    );

    next();
  };
};

export const getCorrelationId = (res: Response): string => {
  return (res.locals.correlationId as string) ?? randomUUID();
};

export const getTraceInfo = (res: Response): { traceId?: string; spanId?: string } => {
  return {
    traceId: res.locals.traceId as string | undefined,
    spanId: res.locals.spanId as string | undefined
  };
};
