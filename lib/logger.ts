// Structured logger with colored CLI output
// Zero external dependencies — uses only Node.js built-ins

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogData {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  child(prefix: string): Logger;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (env in LEVEL_PRIORITY) return env as LogLevel;
  return 'info';
}

function isColorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function formatData(data: LogData): string {
  return Object.entries(data)
    .map(([key, value]) => {
      if (value instanceof Error) {
        return `${key}=${value.message}`;
      }
      if (typeof value === 'object' && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${value}`;
    })
    .join(' ');
}

function formatPretty(
  level: LogLevel,
  prefix: string,
  message: string,
  data?: LogData,
  color = true
): string {
  const ts = formatTimestamp();
  const label = LEVEL_LABELS[level];
  const dataStr = data ? ' ' + formatData(data) : '';

  if (!color) {
    const pfx = prefix ? ` [${prefix}]` : '';
    return `${ts} ${label}${pfx} ${message}${dataStr}`;
  }

  const levelColor = LEVEL_COLORS[level];
  const pfx = prefix ? ` ${COLORS.blue}[${prefix}]${COLORS.reset}` : '';
  return `${COLORS.dim}${ts}${COLORS.reset} ${levelColor}${label}${COLORS.reset}${pfx} ${message}${dataStr ? COLORS.dim + dataStr + COLORS.reset : ''}`;
}

function formatJSON(
  level: LogLevel,
  prefix: string,
  message: string,
  data?: LogData
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    ...(prefix && { prefix }),
    message,
    ...data,
  });
}

function createLoggerImpl(prefix: string): Logger {
  const minLevel = getMinLevel();
  const useColor = isColorEnabled();
  const useJSON = process.env.LOG_FORMAT === 'json';

  function log(level: LogLevel, message: string, data?: LogData): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

    const line = useJSON
      ? formatJSON(level, prefix, message, data)
      : formatPretty(level, prefix, message, data, useColor);

    if (level === 'error' || level === 'warn') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  return {
    debug: (message, data?) => log('debug', message, data),
    info: (message, data?) => log('info', message, data),
    warn: (message, data?) => log('warn', message, data),
    error: (message, data?) => log('error', message, data),
    child: (childPrefix: string) =>
      createLoggerImpl(prefix ? `${prefix}:${childPrefix}` : childPrefix),
  };
}

export function createLogger(prefix?: string): Logger {
  return createLoggerImpl(prefix || '');
}

export const logger = createLogger();
