export interface EncryptionContext {
  userId?: string;
  serviceId?: string;
}

export interface EncryptedPayloadV1 {
  data: string;
  algorithm: string;
}

export interface EncryptedPayloadV2 {
  version: 2;
  algorithm: 'RSA-OAEP-AES256GCM';
  encryptedKey: string;
  iv: string;
  tag: string;
  data: string;
}

export interface PeerKeyStore {
  getPublicKey(ownerId: string): Promise<string | null>;
  setPublicKey(ownerId: string, publicKey: string): Promise<void>;
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
