import 'dotenv/config';
// Define log levels
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Get the current log level from environment or default to INFO
const currentLogLevel = process.env.LOG_LEVEL
  ? (LogLevel[process.env.LOG_LEVEL.toUpperCase()] ?? LogLevel.INFO)
  : LogLevel.INFO;

console.log(`Logger initialized with LOG_LEVEL=${process.env.LOG_LEVEL}, resolved level=${currentLogLevel}`);

// Format the log message with timestamp and metadata
function formatLogMessage(level, message, metadata) {
  const timestamp = new Date().toISOString();
  let formattedMessage = `[${timestamp}] [${level}] ${message}`;

  if (metadata) {
    try {
      if (metadata instanceof Error) {
        formattedMessage += ` Error: ${metadata.message}`;
        if (metadata.stack) {
          formattedMessage += `\nStack: ${metadata.stack}`;
        }
      } else {
        formattedMessage += ` ${JSON.stringify(metadata, null, 2)}`;
      }
    } catch (_error) {
      formattedMessage += ` [Metadata serialization failed]`;
    }
  }

  return formattedMessage;
}

// Logger implementation
export const logger = {
  debug: (message, metadata) => {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(formatLogMessage("DEBUG", message, metadata));
    }
  },

  info: (message, metadata) => {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(formatLogMessage("INFO", message, metadata));
    }
  },

  warn: (message, metadata) => {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(formatLogMessage("WARN", message, metadata));
    }
  },

  error: (message, error, metadata) => {
    if (currentLogLevel <= LogLevel.ERROR) {
      let errorDetails = undefined;

      if (error) {
        if (error instanceof Error) {
          errorDetails = {
            message: error.message,
            stack: error.stack,
          };
        } else {
          errorDetails = error;
        }
      }

      const combinedMetadata = metadata ? { ...metadata, error: errorDetails } : { error: errorDetails };
      console.error(formatLogMessage("ERROR", message, combinedMetadata));
    }
  },
};
