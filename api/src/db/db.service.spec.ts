import { DbService, DbQueryResult, SearchOptions } from "./db.service";
import { randomUUID } from "crypto";
import { DeleteReason, DocType, PostType, Uuid } from "../enums";
import { createTestingModule } from "../test/testingModule";
import { PostDto } from "../dto/PostDto";
import waitForExpect from "wait-for-expect";
import { DeleteCmdDto } from "../dto/DeleteCmdDto";

describe("DbService", () => {
    let service: DbService;

    beforeAll(async () => {
        service = (await createTestingModule("db-service")).dbService;
    });

    describe("general", () => {
        it("can be instantiated", () => {
            expect(service).toBeDefined();
        });

        it("can read a single existing document", async () => {
            const res: any = await service.getDoc("user-public");

            expect(res.docs[0]._id).toBe("user-public");
        });

        it("can handle exceptions on reading non-exising documents", async () => {
            const res: any = await service.getDoc("non-existing-document");

            expect(res.docs.length).toBe(0);
        });

        it("gracefully handles document get requests with no document ID's or document types specified", async () => {
            const res1 = await service.getDocs([], []);
            const res2 = await service.getDocs([], [DocType.Post]);
            const res3 = await service.getDocs(["lang-eng"], []);

            expect(res1.docs.length).toBe(0);
            expect(res2.docs.length).toBe(0);
            expect(res3.docs.length).toBe(0);

            expect(res1.warnings).toContain("No document IDs or document types specified");
            expect(res2.warnings).toContain("No document IDs or document types specified");
            expect(res3.warnings).toContain("No document IDs or document types specified");
        });

        it("can get a list of documents filtered by document ID and document type", async () => {
            // Test if we can return two documents with the passed IDs and valid document types
            const res: any = await service.getDocs(
                ["lang-eng", "user-public"],
                [DocType.Language, DocType.User],
            );

            expect(res.docs.length).toBe(2);
            expect(res.docs.some((d) => d._id === "lang-eng")).toBe(true);
            expect(res.docs.some((d) => d._id === "user-public")).toBe(true);

            // Test if we can return one document with a correct document type, while the other document is discarded due to an incorrect document type
            const res2: any = await service.getDocs(
                ["lang-eng", "user-public"],
                [DocType.Language, DocType.Group],
            );

            expect(res2.docs.length).toBe(1);
            expect(res2.docs.some((d) => d._id === "lang-eng")).toBe(true);
            expect(res2.docs.some((d) => d._id === "user-public")).toBe(false);
        });

        it("can get content documents by their parent ID", async () => {
            const res: any = await service.getContentByParentId("post-blog1");

            expect(res.docs.length).toBe(2);
            expect(res.docs.some((d) => d._id == "content-blog1-eng")).toBe(true);
            expect(res.docs.some((d) => d._id == "content-blog1-fra")).toBe(true);
        });

        it("does not return indexing warnings on getGroups queries", async () => {
            const res: DbQueryResult = await service.getGroups();
            expect(res.warnings).toBe(undefined);
        });

        it("can retrieve all documents of a specific type", async () => {
            const res = await service.getDocsByType(DocType.Post, 1);
            expect(res.docs.length).toBe(1);
            expect(res.docs.every((d) => d.type === DocType.Post)).toBe(true);
        });

        it("can retrieve all content documents of a specific language", async () => {
            const res = await service.getContentByLanguage("lang-eng", 1);
            expect(res.docs.length).toBe(1);
            expect(res.docs.every((d) => d.type === DocType.Content)).toBe(true);
            expect(res.docs.every((d) => d.language === "lang-eng")).toBe(true);
        });

        it("can get a user document by email", async () => {
            const res = await service.getUserByIdOrEmail("editor1@users.test", undefined);
            expect(res.docs.length).toBe(1);
            expect(res.docs[0].type === DocType.User).toBe(true);
            expect(res.docs[0].userId).toBe("editor1");
        });

        it("can get a user document by userId", async () => {
            const res = await service.getUserByIdOrEmail("outdated@email.address", "editor1");
            expect(res.docs.length).toBe(1);
            expect(res.docs[0].type === DocType.User).toBe(true);
            expect(res.docs[0].email).toBe("editor1@users.test");
        });
    });

    describe("upsert", () => {
        it("can insert a new document and return the full document in the result's 'changes' field", async () => {
            const uuid = randomUUID();
            const doc = {
                _id: uuid,
                testData: "test123",
            };

            const res = await service.upsertDoc(doc);

            const testGet = (await service.getDoc(uuid)) as any;

            expect(testGet.docs[0]._id).toBe(uuid);
            expect(testGet.docs[0].testData).toBe("test123");
            expect(res.changes.testData).toBe("test123");
            expect(res.changes._id).toBe(uuid);
        });

        it("can calculate a document diff and return the diff with the upsert result", async () => {
            const doc1 = {
                _id: "diffTest",
                testData: "test123",
                unchangedData: "test123",
            };
            const doc2 = {
                _id: "diffTest",
                testData: "changedData123",
                unchangedData: "test123",
            };

            await service.upsertDoc(doc1);
            const res = await service.upsertDoc(doc2);

            expect(res.changes.testData).toBe("changedData123");
            expect(res.changes._id).toBe("diffTest");
            expect(res.changes.unchangedData).toBe(undefined);
        });

        it("cannot insert a new document without an id", async () => {
            const doc = {
                testData: "test123",
            };

            const res = await service.upsertDoc(doc).catch((e) => e);

            expect(res.message).toBe(
                "Invalid document: The passed document does not have an '_id' property",
            );
        });

        it("can update an existing document", async () => {
            const uuid = randomUUID();

            // Insert a document
            const originalDoc = {
                _id: uuid,
                testData: "test123",
            };
            await service.upsertDoc(originalDoc);

            // Update the document
            const changedDoc = {
                _id: uuid,
                testData: "changedData123",
            };
            await service.upsertDoc(changedDoc);

            const testGet = (await service.getDoc(uuid)) as any;

            expect(testGet.docs[0]._id).toBe(uuid);
            expect(testGet.docs[0].testData).toBe("changedData123");
        });

        it("will only update a document if the document has changed, ignoring _rev and undefined fields", async () => {
            const uuid = randomUUID();

            // Insert a document
            const originalDoc = {
                _id: uuid,
                testData: "test123",
            };
            await service.upsertDoc(originalDoc);

            // Add a _rev property and some empty fields to the document
            const changedDoc = {
                _id: uuid,
                testData: "test123",
                _rev: "123",
                test: undefined,
                test2: null,
            };

            // Update the document with the same data
            const res = await service.upsertDoc(changedDoc);

            expect(res.message).toBe("Document is identical to the one in the database");
        });

        it("can get the latest document updated time", async () => {
            // Add / update a document and check if the latest document update time is close to now.
            const doc = {
                _id: "docUpdateTimeTest",
                testData: "newData123",
            };
            await service.upsertDoc(doc);
            const newDoc = (await service.getDoc(doc._id)).docs[0];

            const res: number = await service.getLatestDocUpdatedTime();

            expect(res).toBe(newDoc.updatedTimeUtc);
        });

        it("can detect that a document is exactly the same as the document in the database", async () => {
            const doc = {
                _id: "docIdenticalTest",
                testData: "test123",
            };
            await service.upsertDoc(doc);
            const res: any = await service.upsertDoc(doc);
            expect(res.message).toBe("Document is identical to the one in the database");
        });

        it("can handle simultaneous updates to a single existing document", async () => {
            // Insert a document into the database to ensure there is an existing document
            await service.upsertDoc({ _id: "simultaneousTest", testVal: 0 });

            // Generate changes to the document and submit them in parallel
            const pList = new Array<Promise<any>>();

            for (let index = 1; index <= 50; index++) {
                pList.push(service.upsertDoc({ _id: "simultaneousTest", testVal: index }));
            }

            let res: boolean = false;
            await Promise.all(pList);

            // if we got past this point without an exception, the test was successful
            res = true;
            expect(res).toBe(true);
        }, 15000);

        it("emits two 'update' events when a document is added or updated", async () => {
            const doc = {
                _id: "post-post1",
                type: "post",
                memberOf: ["group-public-content"],
                image: "test-data",
                tags: ["tag-category1", "tag-topicA"],
            };

            // check if an update is emitted with the updated document
            const postUpdateHandler = (update: any) => {
                if (update.type === DocType.Post) {
                    expect(update._id).toBe("post-post1");
                    expect(update.image).toBe("test-data");
                    service.off("update", postUpdateHandler);
                }
            };

            // check if an update is emitted with the change document
            const changeUpdateHandler = (update: any) => {
                if (update.type === DocType.Change) {
                    expect(update.docId).toBe("post-post1");
                    expect(update.change.image).toBe("test-data");
                    service.off("update", changeUpdateHandler);
                }
            };

            service.on("update", postUpdateHandler);
            service.on("update", changeUpdateHandler);

            await service.upsertDoc(doc);
        });
    });

    describe("group documents", () => {
        it("can get all groups", async () => {
            const res: any = await service.getGroups();

            const docCount = res.docs.length;
            expect(docCount).toBe(8);
        });

        it("can retrieve a list of groups from the db (getUserGroups)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
                "group-public-tags",
                "group-private-tags",
                "group-public-users",
                "group-private-users",
            ];

            const res: any = await service.getUserGroups(userAccess);

            expect(res.docs).toBeDefined();
            expect(res.docs.length).toBeGreaterThan(0);
        });

        it("returns no groups if user does not have the right access (getUserGroups)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = ["group-super-admins"];

            const res: any = await service.getUserGroups(userAccess);

            expect(res.docs).toBeDefined();
            expect(res.docs.length).toBe(0);
        });
    });

    describe("search", () => {
        it("can retrieve documents queryDocs, with a limit of 10 (queryDocs)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = ["group-public-content"];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag, DocType.Language, DocType.Group],
                groups: ["group-super-admins", "group-public-content", "group-private-content"],
                limit: 10,
            };

            const res = await service.search(options);
            expect(res.docs.length).toBe(10);
        });

        it("can retrieve documents queryDocs, between 2 timestamps (queryDocs)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag, DocType.Language, DocType.Group],
                groups: ["group-super-admins", "group-public-content", "group-private-content"],
                limit: 30,
                to: undefined,
                from: undefined,
            };

            // retrieve current timestamps
            const res = await service.search(options);
            options.to = res.docs[10].updatedTimeUtc;
            options.from = res.docs[res.docs.length - 10].updatedTimeUtc;

            const res2 = await service.search(options);
            expect(res2.docs.length).toBeGreaterThan(0);
        });

        it("can sort documents in ascending and descending order (queryDocs)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag, DocType.Language, DocType.Group],
                groups: ["group-super-admins", "group-public-content", "group-private-content"],
                limit: 10,
                sort: [{ updatedTimeUtc: "asc" }],
            } as SearchOptions;

            const res = await service.search(options);

            options.sort = [{ updatedTimeUtc: "desc" }];
            const res2 = await service.search(options);

            expect(res.docs[9]?.updatedTimeUtc).toBeGreaterThan(res.docs[0]?.updatedTimeUtc);
            expect(res2.docs[0]?.updatedTimeUtc).toBeGreaterThan(res2.docs[9]?.updatedTimeUtc);
        });

        it("returns no data if user has no access (queryDocs)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag, DocType.Language, DocType.Group],
                groups: ["group-super-admins", "group-public-content", "group-private-content"],
            };

            const res = await service.search(options);

            expect(res.docs.length).toBeLessThan(1);
        });

        it("use default all groups if the user does not provide an array of groups (queryDocs)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag, DocType.Language], // need to exclude group type, since it does not check the groups array for this
            };

            const res = await service.search(options);

            expect(res.docs.length).toBeGreaterThan(1);
        });

        it("can request content docs only (queryDocs)", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag, DocType.Language], // need to exclude group type, since it does not check the groups array for this
                contentOnly: true,
                groups: ["group-super-admins", "group-public-content", "group-private-content"],
            };

            const res = await service.search(options);
            const notContentDocs = res.docs.filter((d) => d.type !== DocType.Content);

            expect(notContentDocs.length).toBeLessThan(1);
        });

        it("can retrieve only a specific language from the api", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                types: [DocType.Post, DocType.Tag], // need to exclude group type, since it does not check the groups array for this
                contentOnly: true,
                groups: ["group-super-admins", "group-public-content", "group-private-content"],
                languages: ["lang-eng"],
            };

            const res = await service.search(options);
            const notEnglishDocs = res.docs.filter((d) => d.language !== "lang-eng");

            expect(res.docs.length).toBeGreaterThan(1);
            expect(notEnglishDocs.length).toBeLessThan(1);
        });

        it("can retrieve documents by their slug", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Post] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Tag] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            userAccess[DocType.Group] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];
            const options = {
                userAccess: userAccess,
                slug: "blog1-eng",
            } as SearchOptions;

            const res = await service.search(options);
            expect(res.docs.length).toBe(1);
            expect(res.docs[0].slug).toBe("blog1-eng");
        });

        it("can retrieve redirects by their slug", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Redirect] = ["group-public-content"];
            const options = {
                userAccess: userAccess,
                slug: "post1-eng",
            } as SearchOptions;

            const res = await service.search(options);
            expect(res.docs.length).toBe(1);
            expect(res.docs[0].slug).toBe("post1-eng");
            expect(res.docs[0].type).toBe(DocType.Redirect);
        });

        it("can retrieve documents by their parentId", async () => {
            const userAccess = new Map<DocType, Uuid[]>();
            userAccess[DocType.Content] = [
                "group-super-admins",
                "group-public-content",
                "group-private-content",
            ];

            const options = {
                userAccess: userAccess,
                parentId: "post-blog1",
                types: [DocType.Content],
            } as SearchOptions;

            const res = await service.search(options);
            expect(res.docs.length).toBe(2);
            expect(res.docs[0].parentId).toBe("post-blog1");
        });
    });

    describe("delete", () => {
        it("can delete a document", async () => {
            const doc = {
                _id: "delete-test",
                testData: "test123",
            };

            await service.upsertDoc(doc);
            await service.deleteDoc(doc._id);

            const res: any = await service.getDoc(doc._id);

            expect(res.docs.length).toBe(0);
        });

        it("can handle exceptions on deleting non-existing documents", async () => {
            const res: any = await service.deleteDoc("non-existing-document");

            expect(res.message).toBe("Document not found");
        });

        it("can create a delete instruction with reason 'deleted'", async () => {
            const data: PostDto = {
                _id: "delete-test-deleted",
                type: DocType.Post,
                memberOf: ["group-public-content"],
                postType: PostType.Blog,
                tags: [],
                publishDateVisible: true,
            };

            const insertResult = await service.insertDeleteCmd({
                reason: DeleteReason.Deleted,
                doc: data,
                prevDoc: data,
            });

            expect(insertResult.ok).toBe(true);
            expect(insertResult.id).not.toBe(data._id); // delete command should have a unique ID

            const res = await service.getDoc(insertResult.id);

            expect(res.docs.length).toBe(1);
            expect(res.docs[0].deleteReason).toBe(DeleteReason.Deleted);
            expect(res.docs[0].memberOf).toEqual(data.memberOf);
            expect(res.docs[0].type).toBe(DocType.DeleteCmd);
            expect(res.docs[0].docType).toBe(data.type);
            expect(res.docs[0].docId).toBe(data._id);
        });

        it("fails when trying to create a delete instruction for a group document", async () => {
            const doc = {
                _id: "group-public-content",
                testData: "test123",
                type: DocType.Group,
            };

            const err = await service
                .insertDeleteCmd({ reason: DeleteReason.Deleted, doc: doc, prevDoc: doc })
                .catch((e) => e);

            expect(err.message).toBe(
                "Permission change delete command is not valid for group documents, as they are not synced to clients",
            );
        });

        it("can generate a delete instruction for a 'statusChange' reason", async () => {
            const doc = {
                _id: "delete-test",
                testData: "test123",
                type: DocType.Content,
                status: "draft",
                memberOf: ["group-public-content"],
            };

            const insertResult = await service.insertDeleteCmd({
                reason: DeleteReason.StatusChange,
                doc: doc,
                prevDoc: { ...doc, status: "published" },
            });

            expect(insertResult.ok).toBe(true);
            expect(insertResult.id).not.toBe(doc._id); // delete command should have a unique ID

            const res = await service.getDoc(insertResult.id);

            expect(res.docs.length).toBe(1);
            expect(res.docs[0].deleteReason).toBe(DeleteReason.StatusChange);
            expect(res.docs[0].memberOf).toEqual(doc.memberOf);
            expect(res.docs[0].type).toBe(DocType.DeleteCmd);
            expect(res.docs[0].docId).toBe(doc._id);
        });

        it("fails when trying to insert a delete instruction for a 'statusChanged' reason for documents other than ContentDto", async () => {
            const doc = {
                _id: "delete-test",
                testData: "test123",
                type: DocType.Post,
            };

            const err = await service
                .insertDeleteCmd({ reason: DeleteReason.StatusChange, doc: doc, prevDoc: doc })
                .catch((e) => e);

            expect(err.message).toBe(
                "Status change delete command is only valid for content documents",
            );
        });

        it("fails when trying to insert a delete instruction for a 'statusChange' reason when the ContentDto status is 'published'", async () => {
            const doc = {
                _id: "delete-test",
                testData: "test123",
                type: DocType.Content,
                status: "published",
            };

            const err = await service
                .insertDeleteCmd({ reason: DeleteReason.StatusChange, doc: doc, prevDoc: doc })
                .catch((e) => e);

            expect(err.message).toBe(
                "Status change delete command is only valid for unpublished content",
            );
        });

        it("can generate a delete instruction for a 'permissionChange' reason", async () => {
            const doc = {
                _id: "delete-test",
                testData: "test123",
                type: DocType.Post,
                memberOf: ["group-public-content"],
            };

            const insertResult = await service.insertDeleteCmd({
                reason: DeleteReason.PermissionChange,
                doc: doc,
                prevDoc: { ...doc, memberOf: ["group-public-content", "group-private-content"] },
            });

            expect(insertResult.ok).toBe(true);
            expect(insertResult.id).not.toBe(doc._id); // delete command should have a unique ID

            const res = await service.getDoc(insertResult.id);

            expect(res.docs.length).toBe(1);
            expect(res.docs[0].deleteReason).toBe(DeleteReason.PermissionChange);
            expect(res.docs[0].memberOf).toEqual(["group-private-content"]); // only the removed groups should get the delete command
            expect(res.docs[0].type).toBe(DocType.DeleteCmd);
            expect(res.docs[0].docType).toBe(doc.type);
            expect(res.docs[0].docId).toBe(doc._id);
        });

        it("does not generate a delete instruction for a 'permissionChange' reason if the permissions has been expanded", async () => {
            const doc = {
                _id: "delete-test",
                testData: "test123",
                type: DocType.Post,
                memberOf: ["group-public-content", "group-private-content"],
            };

            const insertResult = await service.insertDeleteCmd({
                reason: DeleteReason.PermissionChange,
                doc: doc,
                prevDoc: { ...doc, memberOf: ["group-public-content"] },
            });

            expect(insertResult.id).toBe("");
            expect(insertResult.ok).toBe(true);
            expect(insertResult.message).toBe("No delete command needed as no groups were removed");
            expect(insertResult.rev).toBe("");
        });

        describe("Document upsert with delete command generation", () => {
            it("generates a delete instruction for a 'permissionChange' reason when a document is upserted with removed permissions", async () => {
                const doc = {
                    _id: "delete-test",
                    testData: "test123",
                    type: DocType.Post,
                    memberOf: ["group-public-content", "group-private-content"],
                };

                await service.upsertDoc(doc);

                const updatedDoc = {
                    _id: "delete-test",
                    testData: "test123",
                    type: DocType.Post,
                    memberOf: ["group-public-content"],
                };

                // Subscribe to the update event to check if the delete command is generated
                let updateEventDoc: DeleteCmdDto;
                const deleteCmdHandler = (update: DeleteCmdDto) => {
                    if (update.type === DocType.DeleteCmd) {
                        service.off("update", deleteCmdHandler);
                        updateEventDoc = update;
                    }
                };
                service.on("update", deleteCmdHandler);

                const insertResult = await service.upsertDoc(updatedDoc);

                expect(insertResult.ok).toBe(true);

                await waitForExpect(() => {
                    expect(updateEventDoc).toBeDefined();
                    expect(updateEventDoc.docId).toBe("delete-test");
                    expect(updateEventDoc.deleteReason).toBe(DeleteReason.PermissionChange);
                    expect(updateEventDoc.memberOf).toEqual(["group-private-content"]); // only the removed groups should get the delete command
                    expect(updateEventDoc.newMemberOf).toEqual(["group-public-content"]);
                });
            });

            it("generates a delete instruction for a 'statusChange' reason when a document is upserted with a status change from 'published' to 'draft", async () => {
                const doc = {
                    _id: "delete-test-statusChange",
                    testData: "test123",
                    type: DocType.Content,
                    status: "published",
                    memberOf: ["group-public-content"],
                };

                await service.upsertDoc(doc);

                const updatedDoc = {
                    _id: "delete-test-statusChange",
                    testData: "test123",
                    type: DocType.Content,
                    status: "draft",
                    memberOf: ["group-public-content"],
                };

                // Subscribe to the update event to check if the delete command is generated
                let updateEventDoc: DeleteCmdDto;
                const deleteCmdHandler = (update: DeleteCmdDto) => {
                    if (update.type === DocType.DeleteCmd) {
                        service.off("update", deleteCmdHandler);
                        updateEventDoc = update;
                    }
                };
                service.on("update", deleteCmdHandler);

                const insertResult = await service.upsertDoc(updatedDoc);

                expect(insertResult.ok).toBe(true);

                await waitForExpect(() => {
                    expect(updateEventDoc).toBeDefined();
                    expect(updateEventDoc.docId).toBe("delete-test-statusChange");
                    expect(updateEventDoc.deleteReason).toBe(DeleteReason.StatusChange);
                    expect(updateEventDoc.memberOf).toEqual(["group-public-content"]);
                });
            });

            it("generates a delete instruction for a 'deleted' reason when a document is upserted with a deleteReq, and deletes the document itself", async () => {
                const doc = {
                    _id: "delete-test-deleted",
                    testData: "test123",
                    type: DocType.Post,
                    memberOf: ["group-public-content"],
                };

                await service.upsertDoc(doc);

                const updatedDoc = {
                    _id: "delete-test-deleted",
                    testData: "test123",
                    type: DocType.Post,
                    memberOf: ["group-public-content"],
                    deleteReq: 1,
                };

                // Subscribe to the update event to check if the delete command is generated
                let updateEventDoc: DeleteCmdDto;
                const deleteCmdHandler = (update: DeleteCmdDto) => {
                    if (update.type === DocType.DeleteCmd) {
                        service.off("update", deleteCmdHandler);
                        updateEventDoc = update;
                    }
                };
                service.on("update", deleteCmdHandler);

                const insertResult = await service.upsertDoc(updatedDoc);

                expect(insertResult.ok).toBe(true);

                await waitForExpect(() => {
                    expect(updateEventDoc).toBeDefined();
                    expect(updateEventDoc.docId).toBe("delete-test-deleted");
                    expect(updateEventDoc.deleteReason).toBe(DeleteReason.Deleted);
                    expect(updateEventDoc.memberOf).toEqual(["group-public-content"]);
                });

                const res: any = await service.getDoc(updatedDoc._id);

                expect(res.docs.length).toBe(0);
            });

            it("generates two delete instructions when a document is upserted with removed permissions and a status change", async () => {
                const doc = {
                    _id: "delete-test-combined",
                    testData: "test123",
                    type: DocType.Content,
                    status: "published",
                    memberOf: ["group-public-content", "group-private-content"],
                };

                await service.upsertDoc(doc);

                // Subscribe to the update event to check if the delete command is generated
                let updateEventDoc1: DeleteCmdDto;
                const deleteCmdHandler1 = (update: DeleteCmdDto) => {
                    if (
                        update.type === DocType.DeleteCmd &&
                        update.deleteReason === DeleteReason.PermissionChange
                    ) {
                        service.off("update", deleteCmdHandler1);
                        updateEventDoc1 = update;
                    }
                };
                service.on("update", deleteCmdHandler1);

                let updateEventDoc2: DeleteCmdDto;
                const deleteCmdHandler2 = (update: DeleteCmdDto) => {
                    if (
                        update.type === DocType.DeleteCmd &&
                        update.deleteReason === DeleteReason.StatusChange
                    ) {
                        service.off("update", deleteCmdHandler1);
                        updateEventDoc2 = update;
                    }
                };
                service.on("update", deleteCmdHandler2);

                const updatedDoc = {
                    _id: "delete-test-combined",
                    testData: "test123",
                    type: DocType.Content,
                    status: "draft",
                    memberOf: ["group-private-content"],
                };
                const insertResult = await service.upsertDoc(updatedDoc);

                expect(insertResult.ok).toBe(true);

                await waitForExpect(() => {
                    expect(updateEventDoc1).toBeDefined();
                    expect(updateEventDoc1.docId).toBe("delete-test-combined");
                    expect(updateEventDoc1.deleteReason).toBe(DeleteReason.PermissionChange);
                    expect(updateEventDoc1.memberOf).toEqual(["group-public-content"]);
                });

                await waitForExpect(() => {
                    expect(updateEventDoc2).toBeDefined();
                    expect(updateEventDoc2.docId).toBe("delete-test-combined");
                    expect(updateEventDoc2.deleteReason).toBe(DeleteReason.StatusChange);
                    expect(updateEventDoc2.memberOf).toEqual(["group-private-content"]);
                });
            }, 10000000);

            it("sets the docType field to the type of the parent document for content documents", async () => {
                const doc = {
                    _id: "delete-test-content123",
                    testData: "test123",
                    type: DocType.Content,
                    parentType: DocType.Post,
                    memberOf: ["group-public-content"],
                };

                await service.upsertDoc(doc);

                // Subscribe to the update event to check if the delete command is generated
                let updateEventDoc: DeleteCmdDto;
                const deleteCmdHandler = (update: DeleteCmdDto) => {
                    if (
                        update.type === DocType.DeleteCmd &&
                        update.docId === "delete-test-content123"
                    ) {
                        service.off("update", deleteCmdHandler);
                        updateEventDoc = update;
                    }
                };
                service.on("update", deleteCmdHandler);

                const updatedDoc = { ...doc, deleteReq: 1 };
                await service.upsertDoc(updatedDoc);

                await waitForExpect(() => {
                    expect(updateEventDoc).toBeDefined();
                    expect(updateEventDoc.docId).toBe("delete-test-content123");
                    expect(updateEventDoc.type).toBe(DocType.DeleteCmd);
                    expect(updateEventDoc.docType).toBe(DocType.Post);
                });
            });
        });
    });
});
