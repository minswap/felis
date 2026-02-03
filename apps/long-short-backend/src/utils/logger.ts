import util from "node:util";

enum LogLevel {
  ERROR = "ERROR",
  WARN = "WARN",
  INFO = "INFO",
}

// biome-ignore lint/suspicious/noExplicitAny: skip
type LogFunc = (message: string, extra?: Record<string, any> | unknown) => void;

type Logger = {
  error: LogFunc;
  warn: LogFunc;
  info: LogFunc;
  // biome-ignore lint/suspicious/noExplicitAny: skip
  prettyJson: (...message: any) => void;
};

// Example: 2023-10-18 16:01:45.012
function formatDateDevEnv(d: Date): string {
  function pad0s(x: number, length = 2): string {
    let s = x.toString();
    while (s.length < length) {
      s = `0${s}`;
    }
    return s;
  }

  return `${d.getFullYear()}-${pad0s(d.getMonth() + 1)}-${pad0s(d.getDate())} ${pad0s(d.getHours())}:${pad0s(
    d.getMinutes(),
  )}:${pad0s(d.getSeconds())}.${pad0s(d.getMilliseconds(), 3)}`;
}

function formatLevelDevEnv(lvl: LogLevel): string {
  const padLevel = lvl.padEnd(8);
  let coloredLevel: string;
  switch (lvl) {
    case LogLevel.ERROR:
      coloredLevel = `\x1b[31m${padLevel}\x1b[0m`;
      break;
    case LogLevel.WARN:
      coloredLevel = `\x1b[33m${padLevel}\x1b[0m`;
      break;
    case LogLevel.INFO:
      // default color
      coloredLevel = padLevel;
      break;
  }
  return coloredLevel;
}

// biome-ignore lint/suspicious/noExplicitAny: skip
function formatLabelsDevEnv(labels: Record<string, any>): string {
  return Object.entries(labels)
    .map(([k, v]) => `    ${k}=${v}`)
    .join("\n");
}

// biome-ignore lint/suspicious/noExplicitAny: skip
export function shouldUseUtilInspectOnValue(val: any): boolean {
  if (val instanceof Error) {
    return true;
  }
  if (typeof val === "object" && val !== null && typeof val.toString === "function") {
    const str = val.toString();
    if (typeof str === "string" && str.startsWith("[object")) {
      return true;
    }
  }
  return false;
}

// biome-ignore lint/suspicious/noExplicitAny: skip
function log(level: LogLevel, _message: string, extra?: Record<string, any> | unknown): void {
  // build labels object
  // biome-ignore lint/suspicious/noExplicitAny: skip
  const labels: Record<string, any> = {
    time: new Date().toISOString(),
    level,
    message: _message.trim(),
  };
  if (extra instanceof Error) {
    labels.error = extra;
  } else if (typeof extra === "object" && extra !== null) {
    Object.assign(labels, extra);
  } else if (extra !== null && extra !== undefined) {
    labels.extra = extra;
  }

  for (const key in labels) {
    if (shouldUseUtilInspectOnValue(labels[key])) {
      labels[key] = util.inspect(labels[key], {
        colors: true,
        numericSeparator: true,
      });
    }
  }

  // format log line
  let str: string;
  const printedLabels = formatLabelsDevEnv(labels);
  const separator = labels.message && printedLabels ? "\n" : "";
  str = `${formatDateDevEnv(new Date())}  ${formatLevelDevEnv(level)} ${labels.message}${separator}${printedLabels}`;

  switch (level) {
    case LogLevel.ERROR:
    case LogLevel.WARN:
      // write to stderr
      console.error(str);
      break;
    case LogLevel.INFO:
      // write to stdout
      console.info(str);
      break;
  }
}

export const logger: Logger = {
  error: (message, extra) => log(LogLevel.ERROR, message, extra),
  warn: (message, extra) => log(LogLevel.WARN, message, extra),
  info: (message, extra) => log(LogLevel.INFO, message, extra),
  prettyJson(...message) {
    for (const msg of message) {
      if (typeof msg === "object" && msg !== null) {
        const jsonObj = JSON.parse(JSON.stringify(msg));
        console.log(
          util.inspect(jsonObj, {
            colors: true,
            numericSeparator: true,
            depth: Number.POSITIVE_INFINITY,
          }),
        );
      } else {
        console.log(msg);
      }
    }
  },
};
