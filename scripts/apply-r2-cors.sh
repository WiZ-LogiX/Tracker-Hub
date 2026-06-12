#!/usr/bin/env bash
# Apply CORS policy to the R2 bucket so the browser can PUT directly via
# presigned URLs. Run once, then never again unless origins change.
#
# Requires: aws-cli OR s3cmd. We use rclone's `--s3-provider cloudflare`
# path here per Cloudflare's R2 docs, but the canonical route today is:
#   - Dashboard: R2 → pelecanon → Settings → CORS policy → paste JSON
#   - API:       curl PUT to the CORS endpoint with an S3 signature
#
# This file is documentation; the dashboard JSON is the source of truth.

set -euo pipefail

BUCKET="${R2_BUCKET:-pelecanon}"
ACCOUNT_ID="${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"

# Print the JSON the dashboard expects so copy/paste is unambiguous.
cat <<'JSON'
[
  {
    "AllowedOrigins": [
      "https://your-app-domain.example",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Authorization"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
JSON

echo ""
echo "Apply this JSON to:"
echo "  R2 dashboard → $BUCKET → Settings → CORS Policy → 'Add CORS policy'"
echo "Or via API (replace acct + bucket below):"
echo "  curl -X PUT \"https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET/cors\" \\"
echo "    -H \"Authorization: Bearer \$CF_API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    --data @- <<'BODY'"
echo "$(cat <<'JSON'
[
  {
    "AllowedOrigins": ["https://your-app-domain.example", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Authorization"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
JSON
)"
echo "BODY"