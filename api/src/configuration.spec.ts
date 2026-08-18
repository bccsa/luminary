import configuration from "./configuration";

describe("configuration", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("should use default values when env vars are not set", () => {
        delete process.env.SYNC_TOLERANCE;
        delete process.env.DB_MAX_SOCKETS;
        delete process.env.S3_IMG_QUALITY;
        delete process.env.MAX_HTTP_BUFFER_SIZE;
        delete process.env.MAX_MEDIA_UPLOAD_FILE_SIZE;

        const config = configuration();

        expect(config.sync.tolerance).toBe(1000);
        expect(config.database.maxSockets).toBe(512);
        expect(config.imageProcessing.imageQuality).toBe(80);
        expect(config.socketIo.maxHttpBufferSize).toBe(1e7);
        expect(config.socketIo.maxMediaUploadFileSize).toBe(1.5e7);
    });

    it("should use env vars when set", () => {
        process.env.SYNC_TOLERANCE = "4000";
        process.env.DB_MAX_SOCKETS = "256";
        process.env.S3_IMG_QUALITY = "90";

        const config = configuration();

        expect(config.sync.tolerance).toBe(4000);
        expect(config.database.maxSockets).toBe(256);
        expect(config.imageProcessing.imageQuality).toBe(90);
    });

    it("should fallback S3_MEDIA vars to S3 vars", () => {
        delete process.env.S3_MEDIA_ENDPOINT;
        delete process.env.S3_MEDIA_PORT;
        delete process.env.S3_MEDIA_USE_SSL;
        delete process.env.S3_MEDIA_ACCESS_KEY;
        delete process.env.S3_MEDIA_SECRET_KEY;
        delete process.env.S3_MEDIA_BUCKET;

        process.env.S3_ENDPOINT = "s3.example.com";
        process.env.S3_PORT = "443";
        process.env.S3_USE_SSL = "true";
        process.env.S3_ACCESS_KEY = "key1";
        process.env.S3_SECRET_KEY = "secret1";
        process.env.S3_AUDIO_BUCKET = "audio-bucket";

        const config = configuration();

        expect(config.s3Audio.endpoint).toBe("s3.example.com");
        expect(config.s3Audio.port).toBe(443);
        expect(config.s3Audio.useSSL).toBe(true);
        expect(config.s3Audio.accessKey).toBe("key1");
        expect(config.s3Audio.secretKey).toBe("secret1");
        expect(config.s3Audio.audioBucket).toBe("audio-bucket");
    });

    it("should fallback to localhost when no S3 endpoint is set", () => {
        delete process.env.S3_MEDIA_ENDPOINT;
        delete process.env.S3_ENDPOINT;

        const config = configuration();
        expect(config.s3Audio.endpoint).toBe("localhost");
    });

    it("should set bypassTemplateValidation from env var", () => {
        process.env.BYPASS_TEMPLATE_VALIDATION = "true";
        expect(configuration().validation.bypassTemplateValidation).toBe(true);

        process.env.BYPASS_TEMPLATE_VALIDATION = "false";
        expect(configuration().validation.bypassTemplateValidation).toBe(false);
    });

    it("should prefer S3_MEDIA vars over S3 vars", () => {
        process.env.S3_MEDIA_ENDPOINT = "media.example.com";
        process.env.S3_ENDPOINT = "s3.example.com";

        const config = configuration();
        expect(config.s3Audio.endpoint).toBe("media.example.com");
    });

    it("should default the query cost/rate-limit config", () => {
        delete process.env.QUERY_MAX_LIMIT;
        delete process.env.QUERY_EXPENSIVE_DOCS_EXAMINED;
        delete process.env.QUERY_EXPENSIVE_EXAMINED_RATIO;
        delete process.env.QUERY_MAX_FANOUT_PARENTS;
        delete process.env.QUERY_FANOUT_CONCURRENCY;
        delete process.env.QUERY_FANOUT_STRIKE_THRESHOLD;
        delete process.env.QUERY_RATE_LIMIT_ENABLED;
        delete process.env.QUERY_RATE_LIMIT_FREE_STRIKES;
        delete process.env.QUERY_RATE_LIMIT_BASE_BACKOFF_MS;
        delete process.env.QUERY_RATE_LIMIT_MAX_BACKOFF_MS;
        delete process.env.QUERY_RATE_LIMIT_STRIKE_DECAY_MS;

        const config = configuration();
        expect(config.query.maxLimit).toBe(500);
        expect(config.query.expensiveDocsExamined).toBe(1000);
        expect(config.query.expensiveExaminedRatio).toBe(10);
        expect(config.query.maxFanoutParents).toBe(200);
        expect(config.query.fanoutConcurrency).toBe(20);
        expect(config.query.fanoutStrikeThreshold).toBe(25);
        expect(config.query.rateLimit).toEqual({
            enabled: false,
            freeStrikes: 3,
            baseBackoffMs: 5000,
            maxBackoffMs: 300000,
            strikeDecayMs: 600000,
        });
    });

    it("should read query rate-limit config from env vars", () => {
        process.env.QUERY_RATE_LIMIT_ENABLED = "true";
        process.env.QUERY_RATE_LIMIT_FREE_STRIKES = "5";
        process.env.QUERY_EXPENSIVE_DOCS_EXAMINED = "2000";

        const config = configuration();
        expect(config.query.rateLimit.enabled).toBe(true);
        expect(config.query.rateLimit.freeStrikes).toBe(5);
        expect(config.query.expensiveDocsExamined).toBe(2000);
    });

    it("should read the fan-out cap/concurrency/strike config from env vars", () => {
        process.env.QUERY_MAX_FANOUT_PARENTS = "50";
        process.env.QUERY_FANOUT_CONCURRENCY = "5";
        process.env.QUERY_FANOUT_STRIKE_THRESHOLD = "10";

        const config = configuration();
        expect(config.query.maxFanoutParents).toBe(50);
        expect(config.query.fanoutConcurrency).toBe(5);
        expect(config.query.fanoutStrikeThreshold).toBe(10);
    });
});
