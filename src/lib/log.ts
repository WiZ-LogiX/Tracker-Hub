/**
 * Structured JSON logger for server functions.
 *
 * Usage:
 *   import { log } from "@/lib/log";
 *   log.info({ msg: "quote created", tenantId: ctx.tenantId, fn: "createQuote", ms: 42 });
 *
 * Output is a single JSON line to stdout. Cloudflare Workers / Node pick this up
 * automatically. In dev, the Vite server logs it to the terminal.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  tenantId?: string;
  fn?: string;
  ms?: number;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

function fmt(level: LogLevel, msg: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    msg,
    ts: new Date().toISOString(),
    ...meta,
  };
}

export const log = {
  debug(msg: string, meta?: Record<string, unknown>) {
    emit(fmt("debug", msg, meta));
  },
  info(msg: string, meta?: Record<string, unknown>) {
    emit(fmt("info", msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    emit(fmt("warn", msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    emit(fmt("error", msg, meta));
  },
};
