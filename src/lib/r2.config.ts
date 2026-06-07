// Shared R2 configuration types (no runtime dependencies)
export interface R2Config {
  endpoint: string;
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  bucketName: string;
  publicUrl: string | undefined;
  accountId: string;
}