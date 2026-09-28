/**
 * One interface, two drivers. `local` writes to a directory that the
 * ai-service also mounts, so the whole stack runs with no cloud account.
 * Flip STORAGE_DRIVER=s3 in production and nothing else changes.
 *
 * The s3 driver talks to any S3-compatible service — AWS, Supabase
 * Storage, Cloudflare R2, MinIO — by pointing S3_ENDPOINT at it. Only
 * AWS itself needs no endpoint.
 */
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export function buildStorageKey(ownerId, filename) {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-120);
  return `documents/${ownerId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
}

/* ------------------------------------------------------------- local */
const localRoot = path.resolve(process.cwd(), env.storageDir);

const localDriver = {
  async put(key, buffer) {
    const target = path.join(localRoot, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return key;
  },
  async getStream(key) {
    return createReadStream(path.join(localRoot, key));
  },
  async remove(key) {
    await fs.rm(path.join(localRoot, key), { force: true });
  },
};

/* ---------------------------------------------------------------- s3 */
let s3Driver = null;
async function getS3Driver() {
  if (s3Driver) return s3Driver;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
    await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region: env.awsRegion,
    // Only set for S3-compatible services; AWS resolves its own.
    ...(env.s3Endpoint ? { endpoint: env.s3Endpoint } : {}),
    // Supabase, R2 and MinIO address buckets by path rather than by
    // subdomain. Harmless on AWS, required elsewhere.
    ...(env.s3Endpoint ? { forcePathStyle: true } : {}),
    // Credentials come from the environment when set, and otherwise
    // from the AWS default chain (instance role, shared config).
    ...(env.awsAccessKeyId && env.awsSecretAccessKey
      ? {
          credentials: {
            accessKeyId: env.awsAccessKeyId,
            secretAccessKey: env.awsSecretAccessKey,
          },
        }
      : {}),
  });

  s3Driver = {
    async put(key, buffer, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: env.s3Bucket, Key: key, Body: buffer, ContentType: contentType,
      }));
      return key;
    },
    async getStream(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
      return out.Body;
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
    },
  };
  return s3Driver;
}

async function driver() {
  return env.storageDriver === "s3" ? getS3Driver() : localDriver;
}

export const storage = {
  put: async (...args) => (await driver()).put(...args),
  getStream: async (...args) => (await driver()).getStream(...args),
  remove: async (...args) => (await driver()).remove(...args),
};