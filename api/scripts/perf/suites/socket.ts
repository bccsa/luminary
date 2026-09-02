import { io, Socket } from "socket.io-client";
import { PerfConfig } from "../lib/config";
import { distribution, Distribution } from "../lib/stats";

export type SocketRow = {
    mode: "app" | "cms";
    samples: number;
    /** Transport connect, which includes the auth middleware's identity resolution. */
    connect: Distribution;
    /** `clientConfigReq` → `clientConfig`: access-map serialization plus room joins. */
    handshake: Distribution;
    /** Serialized size of the accessMap delivered to the client. */
    accessMapBytes: number;
    accessMapGroups: number;
    error?: string;
};

/**
 * Time the Socket.io connect path. Every client pays this on every reconnect, and the
 * handshake carries the user's whole access map, so its size scales with group count.
 */
export async function runSocketSuite(config: PerfConfig, samples = 10): Promise<SocketRow[]> {
    const rows: SocketRow[] = [];

    for (const mode of ["app", "cms"] as const) {
        const connectMs: number[] = [];
        const handshakeMs: number[] = [];
        let accessMapBytes = 0;
        let accessMapGroups = 0;
        let error: string | undefined;

        for (let i = 0; i < samples; i++) {
            try {
                const result = await measureOnce(config, mode === "cms");
                connectMs.push(result.connectMs);
                handshakeMs.push(result.handshakeMs);
                accessMapBytes = Math.max(accessMapBytes, result.accessMapBytes);
                accessMapGroups = Math.max(accessMapGroups, result.accessMapGroups);
            } catch (err: any) {
                error = String(err?.message ?? err);
                break;
            }
        }

        rows.push({
            mode,
            samples: connectMs.length,
            connect: distribution(connectMs),
            handshake: distribution(handshakeMs),
            accessMapBytes,
            accessMapGroups,
            error,
        });
    }

    return rows;
}

function measureOnce(
    config: PerfConfig,
    cms: boolean,
): Promise<{
    connectMs: number;
    handshakeMs: number;
    accessMapBytes: number;
    accessMapGroups: number;
}> {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        const socket: Socket = io(config.baseUrl, {
            transports: ["websocket"],
            forceNew: true,
            auth: config.token ? { token: config.token, providerId: config.providerId } : {},
        });

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error("socket handshake timed out after 10s"));
        }, 10_000);

        socket.on("connect_error", (err) => {
            clearTimeout(timer);
            socket.close();
            reject(new Error(`connect_error: ${err.message}`));
        });

        socket.on("connect", () => {
            const connectMs = performance.now() - start;
            const handshakeStart = performance.now();

            socket.once("clientConfig", (clientConfig: any) => {
                clearTimeout(timer);
                const handshakeMs = performance.now() - handshakeStart;
                const accessMap = clientConfig?.accessMap ?? {};
                socket.close();
                resolve({
                    connectMs,
                    handshakeMs,
                    accessMapBytes: Buffer.byteLength(JSON.stringify(accessMap)),
                    accessMapGroups: Object.keys(accessMap).length,
                });
            });

            socket.emit("clientConfigReq", { cms, version: 0, accessMap: {} });
        });
    });
}
