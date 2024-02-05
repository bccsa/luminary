import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from "vitest";
import { useSocketConnectionStore } from "./socketConnection";
import { setActivePinia, createPinia } from "pinia";
import { io } from "socket.io-client";

const socketMocks = vi.hoisted(() => {
    return {
        on: vi.fn(),
        emit: vi.fn(),
    };
});

vi.mock("socket.io-client", () => {
    return {
        io: vi.fn().mockImplementation(() => socketMocks),
    };
});

// Invoke the callback for socket.on() only for the passed even
function listenToSocketOnEvent(allowedEvent: string | string[], returnValue?: any) {
    if (typeof allowedEvent == "string") {
        allowedEvent = [allowedEvent];
    }
    socketMocks.on = vi.fn().mockImplementation((socketEvent, callback) => {
        if (allowedEvent.includes(socketEvent)) {
            callback(returnValue);
        }
    });
}

const contentStoreMock = vi.hoisted(() => {
    return {
        saveContent: vi.fn(),
    };
});
vi.mock("./content", () => {
    return {
        useContentStore: vi.fn().mockImplementation(() => contentStoreMock),
    };
});

const postStoreMock = vi.hoisted(() => {
    return {
        savePosts: vi.fn(),
    };
});
vi.mock("./post", () => {
    return {
        usePostStore: vi.fn().mockImplementation(() => postStoreMock),
    };
});

describe("socketConnection", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("connects to the socket and sets the connected status", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("connect");

        store.bindEvents();

        expect(io).toHaveBeenCalledOnce();
        expect(socketMocks.on).toHaveBeenCalledWith("connect", expect.any(Function));
        expect(store.isConnected).toEqual(true);
    });

    it("emits a clientDataReq after connecting", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("connect");

        store.bindEvents();

        expect(socketMocks.emit).toHaveBeenCalledOnce();
        expect(socketMocks.emit).toHaveBeenCalledWith("clientDataReq", { version: 0, cms: true });
    });

    it("sets the state after disconnecting", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("disconnect");

        store.bindEvents();

        expect(store.isConnected).toEqual(false);
    });

    it("saves data from the API", () => {
        const store = useSocketConnectionStore();

        const post = {
            _id: "post-post1",
            type: "post",
            updatedTimeUtc: 3,
            memberOf: ["group-public-content"],
            content: ["content-post1-eng"],
            image: "",
            tags: ["tag-category1", "tag-topicA"],
        };

        const content = {
            _id: "content-post1-eng",
            type: "content",
            updatedTimeUtc: 3,
            memberOf: ["group-public-content"],
            language: "lang-eng",
            status: "published",
            slug: "post1-eng",
            title: "Post 1",
            summary: "This is an example post",
            author: "ChatGPT",
            text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
            seo: "",
            localisedImage: "",
            audio: "",
            video: "",
            publishDate: 3,
            expiryDate: 0,
        };

        listenToSocketOnEvent("data", [post, content]);

        store.bindEvents();

        expect(contentStoreMock.saveContent).toHaveBeenCalledWith([content]);
        expect(postStoreMock.savePosts).toHaveBeenCalledWith([post]);
    });
});
