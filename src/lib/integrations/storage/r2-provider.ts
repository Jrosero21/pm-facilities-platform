// ── Phase 20 — R2 STORAGE PROVIDER (real impl) ────────────────────────────────────────
// The live object store: Cloudflare R2 via the AWS S3 SDK. DELIBERATE divergence from the
// send seam's raw-fetch lean — S3 SigV4 request signing + presigned-URL generation are
// impractical to hand-roll, so we use @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner.
// R2 is S3-compatible, so the standard S3 client points at the R2 endpoint. Reads R2 creds at
// construction and throws if ANY is absent — it must NEVER exist without creds; the factory
// (./index) only ever constructs it when the creds are present and STORAGE_CAPTURE!=1. The
// harness never builds this (it forces the CaptureStorageProvider), so R2 is never reached.

import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type {
  PutRequest,
  PutResult,
  SignedUrlResult,
  StorageProvider,
} from "./provider";

export class R2Provider implements StorageProvider {
  readonly name = "r2";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      // Fail-closed: the factory guards this, but never let a credential-less instance exist.
      throw new Error("R2_CREDENTIALS_MISSING");
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(req: PutRequest): Promise<PutResult> {
    try {
      const checksum = createHash("sha256").update(req.bytes).digest("hex");
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: req.key,
          Body: req.bytes,
          ContentType: req.contentType,
        }),
      );
      return { ok: true, key: req.key, size: req.bytes.length, checksum };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<SignedUrlResult> {
    try {
      const url = await presign(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
      return { ok: true, url, expiresInSeconds };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
