import { io } from "socket.io-client";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { AccessMap } from "src/permissions/permissions.service";

export type socketioTestRequest = {
    cms: boolean;
    version: number;
    changeRequest?: ChangeReqDto;
    timeout?: number;
    getAccessMap?: boolean;
    accessMap?: any; // Using 'any' here to accommodate varied structures for permissions data, which may differ based on client requirements or evolve over time.
};

/**
 * Send a change request to the server and wait for the server to emit the expected number of 'data' events
 * @param changeRequest
 * @param cms - true if the test client should be a CMS client
 * @param timeout - time to wait for server to emit the expected messages
 * @returns
 */
export const socketioTestClient = (
    config: socketioTestRequest,
): Promise<{ docs: any[]; ack: ChangeReqAckDto; accessMap?: AccessMap; version?: number }> => {
    if (config.timeout === undefined) config.timeout = 500;

    return new Promise(async (resolve) => {
        const res = {
            docs: [],
            ack: new ChangeReqAckDto(),
            accessMap: undefined,
            version: undefined,
        };

        // Connect with new instance of socket.io client to avoid interference with other tests
        const testClient = io(`http://localhost:${process.env.PORT}`);

        // Event handlers
        const dataHandler = (data) => {
            res.docs.push(...data.docs);
            if (data.version) res.version = data.version;
        };
        const ackHandler = (ack) => {
            res.ack = ack;
            testClient.off("changeRequestAck", ackHandler);
        };
        const accessMapHandler = (accessMap) => {
            res.accessMap = accessMap;
            testClient.off("accessMap", accessMapHandler);
        };
        const versionHandler = (version) => {
            res.version = version;
            testClient.off("version", versionHandler);
        };

        // Subscribe to events
        testClient.on("data", dataHandler);
        testClient.on("changeRequestAck", ackHandler);
        testClient.on("version", versionHandler);
        if (config.getAccessMap) testClient.on("accessMap", accessMapHandler);

        // We need to send a clientDataReq event to the server to get the latest data and subscribe to updates
        testClient.emit("clientDataReq", {
            version: config.version,
            cms: config.cms,
            accessMap: config.accessMap,
        });

        // Emit change request. The server should emit 'data' and 'changeRequestAck' messages in response (captured in the handlers above)
        if (config.changeRequest) {
            testClient.emit("changeRequest", config.changeRequest);
        }

        // Wait for the server to emit the expected events
        setTimeout(() => {
            if (testClient) {
                testClient.off("data", dataHandler);
                testClient.disconnect();
            }
            resolve(res);
        }, config.timeout);
    });
};
