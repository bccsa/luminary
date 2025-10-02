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

export type Configuration = {
    permissionMap: string;
    s3?: S3Config;
    auth?: AuthConfig;
    database?: DatabaseConfig;
    sync?: SyncConfig;
    socketIo?: SocketIoConfig;
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
        s3: {
            endpoint: process.env.S3_ENDPOINT,
            port: parseInt(process.env.S3_PORT, 10),
            useSSL: process.env.S3_USE_SSL === "true",
            accessKey: process.env.S3_ACCESS_KEY,
            secretKey: process.env.S3_SECRET_KEY,
            imageBucket: process.env.S3_IMG_BUCKET,
            imageQuality: parseInt(process.env.S3_IMG_QUALITY, 10) || 80,
        } as S3Config,
        socketIo: {
            maxHttpBufferSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE, 10) || 1e7,
        } as SocketIoConfig,
    }) as Configuration;
