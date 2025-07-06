import { Socket, io } from "socket.io-client";
import { Socketio } from "./socketio";
import { INestApplication } from "@nestjs/common";
import { createTestingModule } from "./test/testingModule";

describe("Socketio", () => {
    const oldEnv = process.env;
    let server: Socketio;
    let client: Socket;
    let app: INestApplication;

    async function createNestApp(): Promise<INestApplication> {
        const { testingModule } = await createTestingModule("socketio");
        return testingModule.createNestApplication();
    }

    beforeAll(async () => {
        process.env = { ...oldEnv }; // Make a copy of the old environment variables

        process.env.JWT_MAPPINGS = `{
            "groups": {
                "group-super-admins": "() => true"
            },
            "userId": "() => 'user-super-admin'",
            "email": "() => 'test@123.com'",
            "name": "() => 'Test User'"
        }`;

        app = await createNestApp();
        await app.listen(process.env.PORT);

        server = app.get<Socketio>(Socketio);
        client = io(`http://localhost:${process.env.PORT}`);
    });

    afterAll(async () => {
        client.off();
        await app.close();

        process.env = oldEnv; // Restore the original environment variables
    });

    it("can be instantiated", () => {
        expect(server).toBeDefined();
    });
});
