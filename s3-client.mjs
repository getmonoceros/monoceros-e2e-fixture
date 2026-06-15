#!/usr/bin/env node
// S3 probe for the monoceros-e2e `with-rustfs` scenario. A real
// create-bucket / put / get / delete round-trip against the RustFS
// (MinIO-compatible) S3 API via the AWS SDK — deeper than a TCP check.
//
// Connection target (Monoceros injects these for a curated `rustfs`
// service, ADR 0021), all ASSERTED — no hardcoded fallback:
//   - RUSTFS_URL        — the S3 endpoint (http://rustfs:9000)
//   - RUSTFS_ACCESS_KEY — access key
//   - RUSTFS_SECRET_KEY — secret key
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';

const endpoint = process.env.RUSTFS_URL;
const accessKeyId = process.env.RUSTFS_ACCESS_KEY;
const secretAccessKey = process.env.RUSTFS_SECRET_KEY;
const missing = ['RUSTFS_URL', 'RUSTFS_ACCESS_KEY', 'RUSTFS_SECRET_KEY'].filter(
  (k) => !process.env[k],
);
if (missing.length > 0) {
  console.error(
    `FAIL: ${missing.join(', ')} not set — the workspace did not receive the rustfs connection env.`,
  );
  process.exit(1);
}

const s3 = new S3Client({
  endpoint,
  region: 'us-east-1', // arbitrary; RustFS ignores it
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true, // required for MinIO-compatible servers
});

const Bucket = 'probe-e2e';
const Key = 'probe.txt';
const body = 'hello rustfs';

try {
  await s3.send(new CreateBucketCommand({ Bucket }));
  console.log('created bucket');

  await s3.send(new PutObjectCommand({ Bucket, Key, Body: body }));
  console.log('put object');

  const got = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const roundtrip = await got.Body.transformToString();
  if (roundtrip !== body) {
    throw new Error(`get returned ${JSON.stringify(roundtrip)}, expected ${JSON.stringify(body)}`);
  }
  console.log('got object and verified body');

  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  await s3.send(new DeleteBucketCommand({ Bucket }));
  console.log('cleaned up');

  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
