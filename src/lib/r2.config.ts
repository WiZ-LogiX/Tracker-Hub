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

/**
 * CORS policy required on the R2 bucket for browser-direct PUT uploads.
 * Paste this into the bucket's CORS configuration via Cloudflare dashboard
 * (R2 → pelecanon → Settings → CORS Policy) or via Wrangler/R2 API.
 *
 * Why each entry is necessary:
 * - "PUT" with `Content-Type` triggers a CORS preflight (OPTIONS).
 *   Without AllowedMethod: ["PUT"], the preflight fails before the PUT.
 * - Without AllowedHeader: ["Content-Type"], the browser will refuse to send
 *   the Content-Type header on the actual PUT, and the signed URL won't
 *   match (signed-headers includes `host` but the request still has to be
 *   accepted by the server).
 * - MaxAgeSeconds keeps the preflight cached so subsequent uploads don't
 *   burn an extra round-trip.
 *
 * Replace "https://your-app-domain.example" with every origin that needs to
 * upload. For local development, include http://localhost:5173 too.
 */
export const R2_REQUIRED_CORS_POLICY = {
  AllowedOrigins: [
    // Listed by pair: every common dev host × every plausible port.
    // CORS treats `localhost` and `127.0.0.1` as distinct origins, so list both.
    "http://localhost:8081",
    "http://localhost:8083",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8083",
  ],
  AllowedMethods: ["PUT", "GET", "HEAD"],
  AllowedHeaders: ["Content-Type", "Authorization"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3600,
};