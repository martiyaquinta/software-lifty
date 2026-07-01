/*
 * Database Backup Script
 *
 * Cron suggestion (system crontab or Kubernetes CronJob):
 *   0 2 * * * bun run /app/scripts/backup.ts >> /var/log/backup.log 2>&1
 *
 * Keeps last 7 daily backups and last 4 weekly (Monday) backups.
 * Set BACKUP_DIR to override default (./backups).
 * Set S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY to upload to S3.
 */

import { execSync } from "node:child_process";
import { readdirSync, statSync, mkdirSync, unlinkSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";
const KEEP_DAILY = 7;
const KEEP_WEEKLY = 4;

function parseDbUrl(url: string): { host: string; port: string; database: string; user: string; password: string } | null {
  if (!url) return null;
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  return { user: m[1], password: m[2], host: m[3], port: m[4] || "5432", database: m[5] };
}

async function uploadToS3(filePath: string, bucket: string) {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;

  if (!endpoint || !accessKey || !secretKey) return;

  const content = readFileSync(filePath);

  const payloadHashBuf = new Uint8Array(
    await crypto.subtle.digest("SHA-256", content)
  );
  const payloadHash = Array.from(payloadHashBuf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const key = basename(filePath);
  const host = new URL(endpoint).host;
  const datetime = new Date().toISOString().replace(/[:-]/g, "").slice(0, 15) + "000000Z";
  const date = datetime.slice(0, 8);
  const service = "s3";
  const scope = `${date}/${region}/${service}/aws4_request`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalUri = `/${key}`;

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${datetime}`,
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const canonicalRequestBuf = new Uint8Array(new TextEncoder().encode(canonicalRequest));
  const crHashBuf = new Uint8Array(await crypto.subtle.digest("SHA-256", canonicalRequestBuf));
  const crHash = Array.from(crHashBuf).map((b) => b.toString(16).padStart(2, "0")).join("");

  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, crHash].join("\n");

  async function hmac(key: Uint8Array, data: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key.buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  }

  const kDate = await hmac(new TextEncoder().encode("AWS4" + secretKey), date);
  const kRegion = await hmac(new Uint8Array(kDate), region);
  const kService = await hmac(new Uint8Array(kRegion), service);
  const kSigning = await hmac(new Uint8Array(kService), "aws4_request");
  const signatureBuf = await hmac(new Uint8Array(kSigning), stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(`${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Host": host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": datetime,
      "Authorization": authorization,
    },
    body: content,
  });

  if (resp.ok) {
    console.log(`[backup] Uploaded ${key} to S3 (${bucket})`);
  } else {
    console.error(`[backup] S3 upload failed: ${resp.status} ${await resp.text()}`);
  }
}

function cleanupOldBackups() {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const files = (readdirSync(BACKUP_DIR, { withFileTypes: true }))
    .filter((f) => f.isFile() && f.name.endsWith(".sql"))
    .map((f) => {
      const path = join(BACKUP_DIR, f.name);
      const stat = statSync(path);
      return { path, name: f.name, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const daily = files.filter((f) => !f.name.startsWith("weekly-"));
  const weekly = files.filter((f) => f.name.startsWith("weekly-"));

  for (let i = KEEP_DAILY; i < daily.length; i++) {
    console.log(`[backup] Removing old daily backup: ${daily[i].name}`);
    unlinkSync(daily[i].path);
  }
  for (let i = KEEP_WEEKLY; i < weekly.length; i++) {
    console.log(`[backup] Removing old weekly backup: ${weekly[i].name}`);
    unlinkSync(weekly[i].path);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[backup] DATABASE_URL is not set");
    process.exit(1);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  const parsed = parseDbUrl(dbUrl);
  if (!parsed) {
    console.error("[backup] Failed to parse DATABASE_URL");
    process.exit(1);
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const isMonday = dayOfWeek === 1;

  const ts = now.toISOString().replace(/[:.]/g, "-");
  const prefix = isMonday ? `weekly-${ts}` : `daily-${ts}`;
  const filename = `${prefix}.sql`;
  const filePath = join(BACKUP_DIR, filename);

  const env = {
    ...process.env,
    PGPASSWORD: parsed.password,
  };

  console.log(`[backup] Starting pg_dump to ${filePath}`);
  execSync(
    `pg_dump -h ${parsed.host} -p ${parsed.port} -U ${parsed.user} -d ${parsed.database} -F p --no-owner --no-acl -f ${filePath}`,
    { env, stdio: "inherit" }
  );
  console.log(`[backup] pg_dump complete: ${filePath}`);

  if (process.env.S3_ENDPOINT && process.env.S3_BUCKET) {
    await uploadToS3(filePath, process.env.S3_BUCKET);
  }

  cleanupOldBackups();
  console.log("[backup] Done");
}

main().catch((err) => {
  console.error("[backup] Fatal error:", err);
  process.exit(1);
});
