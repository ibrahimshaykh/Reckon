// Structured logging: JSON lines in production (easy for a log aggregator to
// parse), readable text in dev. Nothing fancy — just consistent shape.
type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, fields?: Fields) {
  if (process.env.NODE_ENV === "production") {
    console[level](JSON.stringify({ level, message, ...fields, timestamp: new Date().toISOString() }));
  } else {
    console[level](`[${level}] ${message}`, fields ?? "");
  }
}

export const logger = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
