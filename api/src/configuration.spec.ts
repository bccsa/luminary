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

    it("should read userDataDatabase from USER_DATA_DB without a default", () => {
        delete process.env.USER_DATA_DB;
        expect(configuration().database.userDataDatabase).toBeUndefined();

        process.env.USER_DATA_DB = "luminary-userdata-prod";
        expect(configuration().database.userDataDatabase).toBe("luminary-userdata-prod");
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
});
