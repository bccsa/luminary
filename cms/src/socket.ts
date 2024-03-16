import { io, Socket } from "socket.io-client";

let socket: Socket;
export const getSocket = () => socket;

/**
 * Initialize the socket connection
 * @param token Auth0 access token
 */
export const initSocket = (token?: string) => {
    socket = io(import.meta.env.VITE_API_URL, token ? { auth: { token } } : undefined);
};
