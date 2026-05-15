import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto, {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import type { PeerKeyStore, EncryptedPayloadV1, EncryptedPayloadV2 } from '../types/index.js';

const AES_KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const RSA_MODULUS_BYTES = 256;

const _peerKeys = new Map<string, string>();

export function createPeerKeyStore(): PeerKeyStore {
  return {
    getPublicKey(ownerId: string): Promise<string | null> {
      return Promise.resolve(_peerKeys.get(ownerId) ?? null);
    },
    setPublicKey(ownerId: string, publicKey: string): Promise<void> {
      _peerKeys.set(ownerId, publicKey);
      return Promise.resolve();
    },
  };
}

let _serviceKeyPair: { publicKey: string; privateKey: string } | null = null;
export function getServiceKeyPair(publicKeyPem?: string, privateKeyPem?: string) {
  if (_serviceKeyPair) return _serviceKeyPair;
  if (publicKeyPem && privateKeyPem) {
    _serviceKeyPair = { publicKey: publicKeyPem, privateKey: privateKeyPem };
  } else {
    _serviceKeyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  }
  return _serviceKeyPair;
}

export function getServicePublicKey(publicKeyPem?: string, privateKeyPem?: string): string {
  return getServiceKeyPair(publicKeyPem, privateKeyPem).publicKey;
}

function encryptWithHybrid(plaintext: string, publicKeyPem: string): EncryptedPayloadV2 {
  const aesKey = randomBytes(AES_KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedKey = publicEncrypt(
    { key: publicKeyPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    aesKey,
  );

  return {
    version: 2,
    algorithm: 'RSA-OAEP-AES256GCM',
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

function decryptPayload(
  body: Record<string, unknown>,
  privateKeyPem: string,
): { success: true; plaintext: string } | { success: false; error: string } {
  if ('encryptedKey' in body) {
    const payload = body as unknown as EncryptedPayloadV2;
    try {
      const encryptedKey = Buffer.from(payload.encryptedKey, 'base64');
      const iv = Buffer.from(payload.iv, 'base64');
      const tag = Buffer.from(payload.tag, 'base64');
      const data = Buffer.from(payload.data, 'base64');

      const aesKey = privateDecrypt(
        {
          key: privateKeyPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        encryptedKey,
      );

      const decipher = createDecipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
      return { success: true, plaintext };
    } catch {
      return { success: false, error: 'Failed to decrypt hybrid encrypted payload' };
    }
  }

  if ('data' in body && 'algorithm' in body) {
    const payload = body as unknown as EncryptedPayloadV1;
    if (payload.algorithm === 'RSA-OAEP') {
      try {
        const raw = Buffer.from(payload.data, 'base64');
        if (raw.length > RSA_MODULUS_BYTES) {
          return {
            success: false,
            error:
              'Payload too large for RSA-2048. Use hybrid encryption (RSA-OAEP-AES256GCM) for larger payloads.',
          };
        }
        const decrypted = privateDecrypt(
          {
            key: privateKeyPem,
            oaepHash: 'sha256',
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          },
          raw,
        );
        return { success: true, plaintext: decrypted.toString('utf-8') };
      } catch {
        return { success: false, error: 'Failed to decrypt RSA-OAEP payload' };
      }
    }
  }

  return { success: false, error: 'Unknown encrypted payload format' };
}

export function registerEncryptionPlugin(
  app: FastifyInstance,
  peerKeyStore?: PeerKeyStore,
  publicKeyPem?: string,
  privateKeyPem?: string,
) {
  const serviceKeyPair = getServiceKeyPair(publicKeyPem, privateKeyPem);
  const store = peerKeyStore ?? createPeerKeyStore();

  app.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.schema?.disableEncryption === true) {
      return;
    }

    if (request.body && typeof request.body === 'object') {
      const body = request.body as Record<string, unknown>;
      const isEncrypted = 'encryptedKey' in body || ('data' in body && 'algorithm' in body);
      if (!isEncrypted) {
        return;
      }

      const result = decryptPayload(body, serviceKeyPair.privateKey);
      if (!result.success) {
        request.log.warn({ error: result.error }, 'Failed to decrypt request body');
        reply.status(400).send({ error: result.error });
        return;
      }

      try {
        request.body = JSON.parse(result.plaintext);
      } catch {
        request.log.warn('Decrypted body is not valid JSON');
        reply.status(400).send({ error: 'Decrypted body is not valid JSON' });
      }
    }
  });

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.schema?.disableEncryption === true) {
      return;
    }

    const originalSend = reply.send.bind(reply);
    reply.send = function (payload: unknown) {
      if (reply.sent) {
        return reply;
      }

      const ownerId = request.encryptionContext?.userId ?? request.encryptionContext?.serviceId;
      if (!ownerId || !payload) {
        return originalSend(payload);
      }

      store
        .getPublicKey(ownerId)
        .then((publicKeyPem) => {
          if (!publicKeyPem) {
            return originalSend(payload);
          }
          const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
          const encryptedPayload = encryptWithHybrid(serialized, publicKeyPem);
          return originalSend(encryptedPayload);
        })
        .catch((err: unknown) => {
          request.log.warn({ err }, 'Encryption failed, sending unencrypted response');
          return originalSend(payload);
        });

      return reply;
    };
  });

  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.schema?.disableEncryption === true) {
      return;
    }

    const ownerId = request.encryptionContext?.userId ?? request.encryptionContext?.serviceId;
    if (!ownerId) {
      return;
    }

    try {
      const publicKeyPem = await store.getPublicKey(ownerId);
      if (!publicKeyPem) {
        return;
      }

      const errorMessage = reply.raw.statusMessage || 'Internal Server Error';
      const payload = JSON.stringify({ error: errorMessage });

      const encryptedPayload = encryptWithHybrid(payload, publicKeyPem);

      if (!reply.sent) {
        reply.status(reply.statusCode).send(encryptedPayload);
      }
    } catch (err) {
      request.log.warn({ err }, 'onError encryption failed');
    }
  });

  app.log.info('Encryption plugin registered');
  app.log.info(`Service public key:\n${serviceKeyPair.publicKey}`);
}
