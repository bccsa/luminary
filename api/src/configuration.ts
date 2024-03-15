export type AuthConfig = {
    jwtSecret: string;
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
    permissionMap: any;
    auth?: AuthConfig;
    database?: DatabaseConfig;
    sync?: SyncConfig;
};

export default () =>
    ({
        auth: {
            jwtSecret: process.env.JWT_SECRET,
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
    }) as Configuration;
