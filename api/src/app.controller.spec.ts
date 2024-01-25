import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { JwtModule } from "@nestjs/jwt";

describe("AppController", () => {
    let appController: AppController;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [
                JwtModule.register({
                    global: true,
                }),
            ],
            controllers: [AppController],
            providers: [],
        }).compile();

        appController = app.get<AppController>(AppController);
    });

    describe("root", () => {
        it('should return "Hello World!"', () => {
            expect(appController.getHello()).toBe("Hello World!");
        });
    });
});
