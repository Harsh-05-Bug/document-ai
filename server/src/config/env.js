import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
  internalApiKey: required("INTERNAL_API_KEY"),

  storageDriver: process.env.STORAGE_DRIVER || "local",
  storageDir: process.env.STORAGE_DIR || "../storage",
  awsRegion: process.env.AWS_REGION || "us-east-1",
  s3Bucket: process.env.AWS_S3_BUCKET,

  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
};
