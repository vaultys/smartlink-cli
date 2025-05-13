import pino from "pino";
import pretty from "pino-pretty";

export function createLogger(options: { logLevel?: string; name?: string } = {}) {
  const stream = pretty({
    colorize: true,
    translateTime: "HH:MM:ss",
    ignore: "pid,hostname,time,name",
  });

  return pino(
    {
      name: options.name ?? "cli",
      level: options.logLevel ?? "info",
    },
    stream
  );
}

export const defaultLogger = createLogger();
