import { io } from "socket.io-client";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";

/**
 * Send a change request to the server and wait for the server to emit the expected number of 'data' events
 * @param changeRequest
 * @param cms - true if the test client should be a CMS client
 * @param timeout - time to wait for server to emit the expected messages
 * @returns
 */
export const socketioTestClient = (
    cms: boolean,
    version: number = 0,
    changeRequest?: ChangeReqDto,
    timeout: number = 1000,
): Promise<{ data: any[]; ack: ChangeReqAckDto }> => {
    return new Promise(async (resolve) => {
        // TODO: Implement authentication in tests and update tests making use of this function

        const res = { data: [], ack: new ChangeReqAckDto() };

        // Connect with new instance of socket.io client to avoid interference with other tests
        const testClient = io(`http://localhost:${process.env.PORT}`);

        // We need to send a clientDataReq event to the server to get the latest data and subscribe to updates
        testClient.emit("clientDataReq", { version, cms });

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

        // Emit change request. The server should emit 'data' and 'changeRequestAck' messages in response (captured in the handlers above)
        if (changeRequest) {
            testClient.emit("changeRequest", changeRequest);
        }

        // Wait for the server to emit the expected events
        setTimeout(() => {
            if (testClient) {
                testClient.off("data", dataHandler);
                testClient.disconnect();
            }
            resolve(res);
        }, timeout);
    });
};
