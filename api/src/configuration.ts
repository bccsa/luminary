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

export type Configuration = {
    permissionMap: string;
    s3?: S3Config;
    auth?: AuthConfig;
    database?: DatabaseConfig;
    sync?: SyncConfig;
    socketIo?: SocketIoConfig;
    validation?: ValidationConfig;
};

export type S3Config = {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    imageBucket: string;
    imageQuality: number;
};

export type SocketIoConfig = {
    maxHttpBufferSize: number;
};

export type Configuration = {
    permissionMap: string;
    auth?: AuthConfig;
    database?: DatabaseConfig;
    sync?: SyncConfig;
    imageProcessing?: ImageProcessingConfig;
    socketIo?: SocketIoConfig;
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
        socketIo: {
            maxHttpBufferSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE, 10) || 1e7,
        } as SocketIoConfig,
        validation: {
            bypassTemplateValidation: process.env.BYPASS_TEMPLATE_VALIDATION === "true",
        } as ValidationConfig,
    }) as Configuration;
