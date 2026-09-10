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
     * Bounds successful key fetches (ADR 0019). Defaults ON.
     * Environment variable: SIDECAR_RATE_LIMIT_READ_ENABLED.
     */
    read: RateLimiterConfig;
    /**
     * Bounds repeated 403/404 responses (ADR 0019). Defaults ON.
     * Environment variable: SIDECAR_RATE_LIMIT_PROBE_ENABLED.
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

/**
 * One `<PREFIX>_*` group of rate-limiter settings. The three groups differ only in
 * their prefix and defaults, including which way `ENABLED` defaults: only the
 * explicit opposite of the default switches it.
 */
function rateLimitFromEnv(prefix: string, defaults: RateLimiterConfig): RateLimiterConfig {
    const enabled = process.env[`${prefix}_ENABLED`];
    const ms = (name: string, fallback: number) =>
        parseInt(process.env[`${prefix}_${name}`], 10) || fallback;

    return {
        enabled: defaults.enabled ? enabled !== "false" : enabled === "true",
        freeStrikes: ms("FREE_STRIKES", defaults.freeStrikes),
        baseBackoffMs: ms("BASE_BACKOFF_MS", defaults.baseBackoffMs),
        maxBackoffMs: ms("MAX_BACKOFF_MS", defaults.maxBackoffMs),
        strikeDecayMs: ms("STRIKE_DECAY_MS", defaults.strikeDecayMs),
    };
}

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
            rateLimit: rateLimitFromEnv("QUERY_RATE_LIMIT", {
                enabled: false,
                freeStrikes: 3,
                baseBackoffMs: 5000,
                maxBackoffMs: 300000,
                strikeDecayMs: 600000,
            }),
        } as QueryConfig,
        sidecar: {
            rateLimit: {
                read: rateLimitFromEnv("SIDECAR_RATE_LIMIT_READ", {
                    enabled: true,
                    freeStrikes: 30,
                    baseBackoffMs: 2000,
                    maxBackoffMs: 60000,
                    strikeDecayMs: 2000,
                }),
                probe: rateLimitFromEnv("SIDECAR_RATE_LIMIT_PROBE", {
                    enabled: true,
                    freeStrikes: 10,
                    baseBackoffMs: 5000,
                    maxBackoffMs: 300000,
                    strikeDecayMs: 60000,
                }),
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
        } as SocketIoConfig,
        validation: {
            bypassTemplateValidation: process.env.BYPASS_TEMPLATE_VALIDATION === "true",
        } as ValidationConfig,
        auth: {
            allowInsecureProviderDomain: process.env.AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN === "true",
        } as AuthConfig,
    }) as Configuration;
