const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'test' ? LEVELS.error : LEVELS.info);

function emit(level, args) {
  if (LEVELS[level] > threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}]`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
}

const logger = {
  error: (...args) => emit('error', args),
  warn: (...args) => emit('warn', args),
  info: (...args) => emit('info', args),
  debug: (...args) => emit('debug', args),
};

export default logger;
