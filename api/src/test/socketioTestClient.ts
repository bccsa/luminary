import { io } from "socket.io-client";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";

export type socketioTestRequest = {
    cms: boolean;
    version: number;
    changeRequest?: ChangeReqDto;
    timeout?: number;
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
): Promise<{ data: any[]; ack: ChangeReqAckDto }> => {
    if (config.timeout === undefined) config.timeout = 500;

    return new Promise(async (resolve) => {
        // TODO: Implement authentication in tests and update tests making use of this function

        const res = { data: [], ack: new ChangeReqAckDto() };

        // Connect with new instance of socket.io client to avoid interference with other tests
        const testClient = io(`http://localhost:${process.env.PORT}`);

        // Event handlers
        const dataHandler = (data) => {
            res.data.push(...data);
        };
        const ackHandler = (ack) => {
            res.ack = ack;
            testClient.off("changeRequestAck", ackHandler);
        };

        // Subscribe to events
        testClient.on("data", dataHandler);
        testClient.on("changeRequestAck", ackHandler);

        // We need to send a clientDataReq event to the server to get the latest data and subscribe to updates
        testClient.emit("clientDataReq", { version: config.version, cms: config.cms });

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
