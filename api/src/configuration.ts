import { DEFAULT_MAX_LANGUAGES } from "./validation/query/validateQuery";

export type AuthConfig = {
    jwtSecret: string;
    jwtMappings: string;
};

export type DatabaseConfig = {
    connectionString: string;
    database: string;
    maxSockets: number;
};

export type SyncConfig = {
    tolerance: number;
};

export type QueryRateLimitConfig = {
    /**
     * Master switch for the per-identity expensive-query rate limiter. Ships OFF —
     * enable per environment only after the expensive-query logs show sane thresholds.
     * Environment variable: QUERY_RATE_LIMIT_ENABLED (default false).
     */
    enabled: boolean;
    /** Expensive-query strikes tolerated before the first block. QUERY_RATE_LIMIT_FREE_STRIKES (default 3). */
    freeStrikes: number;
    /** First block duration in ms; doubles per extra strike. QUERY_RATE_LIMIT_BASE_BACKOFF_MS (default 5000). */
    baseBackoffMs: number;
    /** Cap on a single block window in ms. QUERY_RATE_LIMIT_MAX_BACKOFF_MS (default 300000). */
    maxBackoffMs: number;
    /** One strike forgiven per this many ms. QUERY_RATE_LIMIT_STRIKE_DECAY_MS (default 600000). */
    strikeDecayMs: number;
};

export type QueryConfig = {
    /**
     * Maximum `limit` accepted on a POST /query request, enforced centrally for every
     * query identifier (sync, hybridQuery, …). Requests above this are rejected with 400.
     * Guards against a single authenticated client forcing CouchDB to materialize a huge
     * result set. Environment variable: QUERY_MAX_LIMIT (default 500).
     */
    maxLimit: number;
    /**
     * Maximum distinct languages a NON-CMS query may reference (via `language` field constraints).
     * Requests above this are rejected with 400. Guards query cost; CMS queries are exempt (they
     * sync all languages). Defaults to DEFAULT_MAX_LANGUAGES (derived: preferred cap + auto-appended
     * default). Environment variable: QUERY_MAX_LANGUAGES.
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
    rateLimit: QueryRateLimitConfig;
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
    permissionMap: string;
    s3?: S3Config;
    s3Audio?: AudioS3Config;
    auth?: AuthConfig;
    database?: DatabaseConfig;
    sync?: SyncConfig;
    query?: QueryConfig;
    imageProcessing?: ImageProcessingConfig;
    socketIo?: SocketIoConfig;
    validation?: ValidationConfig;
};

export default () =>
    ({
        auth: {
            jwtSecret: process.env.JWT_SECRET,
            jwtMappings: process.env.JWT_MAPPINGS,
        } as AuthConfig,
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
            maxLanguages: parseInt(process.env.QUERY_MAX_LANGUAGES, 10) || DEFAULT_MAX_LANGUAGES,
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
        permissionMap: process.env.PERMISSION_MAP,
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
    }) as Configuration;
