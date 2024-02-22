export type AuthConfig = {
    jwtSecret: string;
};

export type DatabaseConfig = {
    connectionString: string;
    database: string;
};

export type SyncConfig = {
    tolerance: number;
};

export default () => ({
    auth: {
        jwtSecret: process.env.JWT_SECRET,
    } as AuthConfig,
    database: {
        connectionString: process.env.DB_CONNECTION_STRING,
        database: process.env.DB_DATABASE,
    } as DatabaseConfig,
    sync: {
        tolerance: parseInt(process.env.PORT, 10) || 1000,
    } as SyncConfig,
});
