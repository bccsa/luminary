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
            tolerance: parseInt(process.env.PORT, 10) || 1000,
        } as SyncConfig,
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
