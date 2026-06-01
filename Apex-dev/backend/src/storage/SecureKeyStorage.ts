import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getStoragePath } from './index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // AES GCM standard

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  // Expect base64-encoded 32 bytes
  return Buffer.from(key, 'base64');
}

export class SecureKeyStorage {
  private basePath: string;

  constructor() {
    this.basePath = path.join(getStoragePath(), 'secrets');
  }

  private async ensureBase() {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  private encrypt(plain: string): { data: string; iv: string; authTag: string } {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { data: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: authTag.toString('base64') };
  }

  private decrypt(data: string, ivB64: string, authTagB64: string): string {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Save a key securely. keyData should be an object (stringified)
  async saveKey(id: string, keyData: Record<string, any>): Promise<void> {
    await this.ensureBase();
    const file = path.join(this.basePath, `${id}.json`);
    // Never write raw secret; encrypt first
    const plain = JSON.stringify(keyData);
    const { data, iv, authTag } = this.encrypt(plain);
    const payload = { data, iv, authTag, createdAt: new Date().toISOString() };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
  }

  async getKey(id: string): Promise<Record<string, any> | null> {
    try {
      const file = path.join(this.basePath, `${id}.json`);
      const raw = await fs.readFile(file, 'utf-8');
      const payload = JSON.parse(raw);
      const decrypted = this.decrypt(payload.data, payload.iv, payload.authTag);
      return JSON.parse(decrypted);
    } catch (error) {
      return null;
    }
  }

  async listKeys(): Promise<{ id: string; createdAt?: string }[]> {
    await this.ensureBase();
    const files = await fs.readdir(this.basePath);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ id: f.replace('.json', ''), createdAt: undefined }));
  }

  async deleteKey(id: string): Promise<void> {
    const file = path.join(this.basePath, `${id}.json`);
    await fs.unlink(file).catch(() => {});
  }
}
