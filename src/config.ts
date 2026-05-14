export interface AppConfig {
  port: number;
  host: string;
  logLevel: string;
  logFormat: 'json' | 'pretty';
  logFile?: string;
  serviceName: string;
  corsOrigin: string;
  internalCallHeader: string;
  gatewayUrl?: string;
  apiPrefix: string;
}

export function loadConfig(): AppConfig {
  const rawLogFormat = process.env.LOG_FORMAT ?? 'pretty';
  if (rawLogFormat !== 'json' && rawLogFormat !== 'pretty') {
    throw new Error(`Invalid LOG_FORMAT: ${rawLogFormat}. Expected 'json' or 'pretty'.`);
  }
  const logFormat: AppConfig['logFormat'] = rawLogFormat;

  const config: AppConfig = {
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 3001,
    host: process.env.HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logFormat,
    logFile: process.env.LOG_FILE ?? undefined,
    serviceName: process.env.SERVICE_NAME ?? 'my-service',
    corsOrigin: process.env.CORS_ORIGIN ?? 'true',
    internalCallHeader: process.env.INTERNAL_CALL_HEADER ?? 'x-internal-call',
    gatewayUrl: process.env.GATEWAY_URL,
    apiPrefix: process.env.API_PREFIX ?? '',
  };

  return config;
}
