import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * CLIENT_ORIGIN accepts a comma-separated list, so a deployment can
 * allow both its production domain and a preview URL without a code
 * change.
 */
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: origins.length === 1 ? origins[0] : origins,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
  internalApiKey: required("INTERNAL_API_KEY"),

  storageDriver: process.env.STORAGE_DRIVER || "local",
  storageDir: process.env.STORAGE_DIR || "../storage",

  // S3-compatible storage. S3_ENDPOINT is set for anything that isn't
  // AWS itself — Supabase Storage, Cloudflare R2, MinIO.
  awsRegion: process.env.AWS_REGION || "us-east-1",
  s3Bucket: process.env.AWS_S3_BUCKET,
  s3Endpoint: process.env.S3_ENDPOINT || null,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,

  // Behind a proxy (Render, Fly, nginx) the client IP arrives in a
  // header. Only trust it when told to: trusting it unconditionally
  // would let anyone spoof their IP and bypass rate limiting.
  trustProxy: process.env.TRUST_PROXY === "true",

  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
};