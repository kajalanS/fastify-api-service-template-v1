import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto, { generateKeyPairSync, publicEncrypt, privateDecrypt } from 'node:crypto';

interface EncryptedPayload {
  data: string;
  algorithm: string;
}

let _serviceKeyPair: { publicKey: string; privateKey: string } | null = null;
export function getServiceKeyPair() {
  _serviceKeyPair ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return _serviceKeyPair;
}

function encryptWithPublicKey(plaintext: string, publicKeyPem: string): string {
  const buffer = Buffer.from(plaintext, 'utf-8');
  const encrypted = publicEncrypt(
    { key: publicKeyPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    buffer,
  );
  return encrypted.toString('base64');
}

function decryptWithPrivateKey(ciphertext: string, privateKeyPem: string): string {
  const buffer = Buffer.from(ciphertext, 'base64');
  const decrypted = privateDecrypt(
    { key: privateKeyPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    buffer,
  );
  return decrypted.toString('utf-8');
}

export function registerEncryptionPlugin(app: FastifyInstance) {
  const serviceKeyPair = getServiceKeyPair();

  app.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.schema?.disableEncryption === true) {
      return;
    }

    if (
      request.body &&
      typeof request.body === 'object' &&
      'data' in (request.body as Record<string, unknown>)
    ) {
      const payload = request.body as EncryptedPayload;
      try {
        const decrypted = decryptWithPrivateKey(payload.data, serviceKeyPair.privateKey);
        request.body = JSON.parse(decrypted);
      } catch (err) {
        request.log.warn({ err }, 'Failed to decrypt request body');
        reply.status(400).send({ error: 'Invalid encrypted payload' });
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

      const targetPublicKeyPem = typeof ownerId === 'string' ? ownerId : null;

      if (!targetPublicKeyPem) {
        return originalSend(payload);
      }

      const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const encrypted = encryptWithPublicKey(serialized, targetPublicKeyPem);
      const encryptedPayload: EncryptedPayload = { data: encrypted, algorithm: 'RSA-OAEP' };
      return originalSend(encryptedPayload);
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
      const errorMessage = reply.raw.statusMessage || 'Internal Server Error';
      const payload = JSON.stringify({ error: errorMessage });

      const encrypted = encryptWithPublicKey(payload, ownerId);
      if (!reply.sent) {
        reply
          .status(reply.statusCode)
          .send({ data: encrypted, algorithm: 'RSA-OAEP' } satisfies EncryptedPayload);
      }
    } catch (err) {
      request.log.warn({ err }, 'onError encryption failed');
    }
  });

  app.log.info('Encryption plugin registered');
  app.log.info(`Service public key:\n${serviceKeyPair.publicKey}`);
}
