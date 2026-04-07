import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";

describe("AppModule", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it("should compile the module in development mode", async () => {
        process.env.NODE_ENV = "development";
        // Re-import the module to trigger the development logger path
        jest.resetModules();
        const { AppModule: FreshAppModule } = await import("./app.module");

        const module = await Test.createTestingModule({
            imports: [FreshAppModule],
        }).compile();

        expect(module).toBeDefined();
        await module.close();
    });

    it("should compile the module in production mode", async () => {
        process.env.NODE_ENV = "production";
        jest.resetModules();
        const { AppModule: FreshAppModule } = await import("./app.module");

        const module = await Test.createTestingModule({
            imports: [FreshAppModule],
        }).compile();

        expect(module).toBeDefined();
        await module.close();
    });
});
