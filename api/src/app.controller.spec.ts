import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AuthGuard } from "./auth/auth.guard";

describe("AppController", () => {
    let controller: AppController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AppController],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<AppController>(AppController);
    });

    it("should return success message for protected endpoint", () => {
        const result = controller.getProtected();
        expect(result).toBe("You've successfully requested a response with a JWT :)");
    });
});
