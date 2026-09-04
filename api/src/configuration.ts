import { RateLimiterConfig } from "./ratelimit/rateLimiter.service";

export type DatabaseConfig = {
    connectionString: string;
    database: string;
    maxSockets: number;
};

export type SyncConfig = {
    tolerance: number;
};

export type QueryConfig = {
    /**
     * Maximum `limit` accepted on a POST /query request, enforced centrally for every
     * query identifier (sync, hybridQuery, …). Requests above this are rejected with 400.
     * Guards against a single authenticated client forcing CouchDB to materialize a huge
     * result set. Keep in step with the client's remote-query clamp
     * (`DEFAULT_REMOTE_QUERY_LIMIT` in `shared/src/util/HybridQuery/HybridQuery.ts`), which must
     * not exceed it. Environment variable: QUERY_MAX_LIMIT (default 500).
     */
    maxLimit: number;
    /**
     * Maximum distinct languages a NON-CMS query may reference (via `language` field constraints).
     * Requests above this are rejected with 400. Guards query cost; CMS queries are exempt (they
     * sync all languages). Keep in step with the client's preferred-language cap (cap + 1 for the
     * auto-appended default). Environment variable: QUERY_MAX_LANGUAGES (default 4).
     */
    maxLanguages: number;
    /**
     * A completed query examining more than this many docs is logged as expensive
     * (likely a full / large table scan). Environment variable:
     * QUERY_EXPENSIVE_DOCS_EXAMINED (default 1000).
     */
    expensiveDocsExamined: number;
    /**
     * A completed query whose examined/returned ratio exceeds this (above an internal
     * floor) is logged as expensive. Environment variable:
     * QUERY_EXPENSIVE_EXAMINED_RATIO (default 10).
     */
    expensiveExaminedRatio: number;
    /** Per-identity expensive-query rate limiter (default off). */
    rateLimit: RateLimiterConfig;
};

export type SidecarRateLimitConfig = {
    /**
     * Bounds successful key fetches — the harvesting-mitigation limiter described in
     * ADR 0019 (docs/adr/0019-hls-encryption-keys-as-non-replicated-sidecars.md). Unlike the query
     * limiter, this defaults ON: /sidecar hands out decryption keys, and the absence of a
     * batch/listing parameter is only meaningful if a caller can't substitute a fast loop of single
     * requests.
     * Environment variable: SIDECAR_RATE_LIMIT_READ_ENABLED (default true).
     */
    read: RateLimiterConfig;
    /**
     * Bounds repeated 403/404 responses (parent-id / permission probing). Lower ceiling than
     * `read` since the endpoint's 404-for-both rule already makes probing uninformative (ADR 0019)
     * — this limiter is a backstop, not the primary defense. Defaults ON.
     * Environment variable: SIDECAR_RATE_LIMIT_PROBE_ENABLED (default true).
     */
    probe: RateLimiterConfig;
};

export type SidecarConfig = {
    rateLimit: SidecarRateLimitConfig;
};

export type ValidationConfig = {
    /**
     * When set to true, query template validation will log warnings instead of throwing exceptions.
     * This is useful during development for testing queries without strict validation.
     * Environment variable: BYPASS_TEMPLATE_VALIDATION=true
     * WARNING: Never enable this in production!
     */
    bypassTemplateValidation: boolean;
};

export type AuthConfig = {
    /**
     * Permits an AuthProvider whose `domain` carries an `http://` scheme. The
     * provider's JWKS is fetched from that host, so over plaintext an on-path
     * attacker can substitute signing keys and forge accepted tokens.
     * Environment variable: AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true
     * WARNING: local test issuers only — never enable this in production.
     */
    allowInsecureProviderDomain: boolean;
};

export type ImageProcessingConfig = {
    imageQuality: number;
};

// S3 Configuration
export type S3Config = {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    imageBucket: string;
    imageQuality: number;
};

export type AudioS3Config = {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    audioBucket: string;
};

export type SocketIoConfig = {
    maxHttpBufferSize: number;
    maxMediaUploadFileSize?: number; // Optional for media uploads
};

export type Configuration = {
    s3?: S3Config;
    s3Audio?: AudioS3Config;
    database?: DatabaseConfig;
    sync?: SyncConfig;
    query?: QueryConfig;
    sidecar?: SidecarConfig;
    imageProcessing?: ImageProcessingConfig;
    socketIo?: SocketIoConfig;
    validation?: ValidationConfig;
    auth?: AuthConfig;
};

export default () =>
    ({
        database: {
            connectionString: process.env.DB_CONNECTION_STRING,
            database: process.env.DB_DATABASE,
            maxSockets: parseInt(process.env.DB_MAX_SOCKETS, 10) || 512,
        } as DatabaseConfig,
        sync: {
            tolerance: parseInt(process.env.SYNC_TOLERANCE, 10) || 1000,
        } as SyncConfig,
        query: {
            maxLimit: parseInt(process.env.QUERY_MAX_LIMIT, 10) || 500,
            maxLanguages: parseInt(process.env.QUERY_MAX_LANGUAGES, 10) || 4,
            expensiveDocsExamined: parseInt(process.env.QUERY_EXPENSIVE_DOCS_EXAMINED, 10) || 1000,
            expensiveExaminedRatio: parseInt(process.env.QUERY_EXPENSIVE_EXAMINED_RATIO, 10) || 10,
            rateLimit: {
                enabled: process.env.QUERY_RATE_LIMIT_ENABLED === "true",
                freeStrikes: parseInt(process.env.QUERY_RATE_LIMIT_FREE_STRIKES, 10) || 3,
                baseBackoffMs: parseInt(process.env.QUERY_RATE_LIMIT_BASE_BACKOFF_MS, 10) || 5000,
                maxBackoffMs: parseInt(process.env.QUERY_RATE_LIMIT_MAX_BACKOFF_MS, 10) || 300000,
                strikeDecayMs: parseInt(process.env.QUERY_RATE_LIMIT_STRIKE_DECAY_MS, 10) || 600000,
            },
        } as QueryConfig,
        sidecar: {
            rateLimit: {
                read: {
                    enabled: process.env.SIDECAR_RATE_LIMIT_READ_ENABLED !== "false",
                    freeStrikes: parseInt(process.env.SIDECAR_RATE_LIMIT_READ_FREE_STRIKES, 10) || 30,
                    baseBackoffMs:
                        parseInt(process.env.SIDECAR_RATE_LIMIT_READ_BASE_BACKOFF_MS, 10) || 2000,
                    maxBackoffMs:
                        parseInt(process.env.SIDECAR_RATE_LIMIT_READ_MAX_BACKOFF_MS, 10) || 60000,
                    strikeDecayMs:
                        parseInt(process.env.SIDECAR_RATE_LIMIT_READ_STRIKE_DECAY_MS, 10) || 2000,
                },
                probe: {
                    enabled: process.env.SIDECAR_RATE_LIMIT_PROBE_ENABLED !== "false",
                    freeStrikes: parseInt(process.env.SIDECAR_RATE_LIMIT_PROBE_FREE_STRIKES, 10) || 10,
                    baseBackoffMs:
                        parseInt(process.env.SIDECAR_RATE_LIMIT_PROBE_BASE_BACKOFF_MS, 10) || 5000,
                    maxBackoffMs:
                        parseInt(process.env.SIDECAR_RATE_LIMIT_PROBE_MAX_BACKOFF_MS, 10) || 300000,
                    strikeDecayMs:
                        parseInt(process.env.SIDECAR_RATE_LIMIT_PROBE_STRIKE_DECAY_MS, 10) || 60000,
                },
            },
        } as SidecarConfig,
        imageProcessing: {
            imageQuality: parseInt(process.env.S3_IMG_QUALITY, 10) || 80,
        } as ImageProcessingConfig,
        s3Audio: {
            endpoint: process.env.S3_MEDIA_ENDPOINT || process.env.S3_ENDPOINT || "localhost",
            port: parseInt(process.env.S3_MEDIA_PORT || process.env.S3_PORT || "9000", 10),
            useSSL: process.env.S3_MEDIA_USE_SSL === "true" || process.env.S3_USE_SSL === "true",
            accessKey: process.env.S3_MEDIA_ACCESS_KEY || process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_MEDIA_SECRET_KEY || process.env.S3_SECRET_KEY,
            audioBucket: process.env.S3_MEDIA_BUCKET || process.env.S3_AUDIO_BUCKET,
        } as AudioS3Config,
        socketIo: {
            maxHttpBufferSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE, 10) || 1e7,
            maxMediaUploadFileSize: parseInt(process.env.MAX_MEDIA_UPLOAD_FILE_SIZE, 10) || 1.5e7, // Default to 15MB
        } as SocketIoConfig,
        validation: {
            bypassTemplateValidation: process.env.BYPASS_TEMPLATE_VALIDATION === "true",
        } as ValidationConfig,
        auth: {
            allowInsecureProviderDomain: process.env.AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN === "true",
        } as AuthConfig,
    }) as Configuration;
