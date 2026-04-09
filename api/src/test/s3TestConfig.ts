const s3Endpoint = process.env.S3_ENDPOINT || "127.0.0.1";
const s3Port = process.env.S3_PORT || "9000";
const s3AccessKey = process.env.S3_ACCESS_KEY || "minio";
const s3SecretKey = process.env.S3_SECRET_KEY || "minio123";
const s3UseSsl = process.env.S3_USE_SSL === "true";
const s3Protocol = s3UseSsl ? "https" : "http";
const s3BaseUrl = `${s3Protocol}://${s3Endpoint}:${s3Port}`;
const s3PublicUrl = process.env.S3_PUBLIC_URL || "http://localhost:9000";

export const s3TestConfig = {
    endpoint: s3Endpoint,
    port: s3Port,
    accessKey: s3AccessKey,
    secretKey: s3SecretKey,
    useSsl: s3UseSsl,
    baseUrl: s3BaseUrl,
    publicUrl: s3PublicUrl,
};

export function createTestCredentials(bucketName = "") {
    return {
        endpoint: s3BaseUrl,
        bucketName,
        accessKey: s3AccessKey,
        secretKey: s3SecretKey,
    };
}
