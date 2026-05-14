export interface EncryptionContext {
  userId?: string;
  serviceId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    encryptionContext?: EncryptionContext;
    isInternalCall?: boolean;
  }

  interface FastifySchema {
    disableEncryption?: boolean;
  }
}
