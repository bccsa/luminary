import { PostDto } from "../../dto/PostDto";
import { DbService } from "../db.service";
import { TagDto } from "../../dto/TagDto";
import { S3Service } from "../../s3/s3.service";
import { S3AudioService } from "../../s3-audio/s3Audio.service";
import { processChangeRequest } from "../../changeRequests/processChangeRequest";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { GroupDto } from "../../dto/GroupDto";
import { DocType } from "../../enums";
import { MediaDto } from "../../dto/MediaDto";
import { MediaFileDto } from "../../dto/MediaFileDto";

/**
 * Upgrade the database schema from version 7 to 8
 * - Set special memberOf field for group documents to improve database query performance
 * - Update media field in PostDto and TagDto documents and upload medias to S3
 */
export default async function (db: DbService, s3: S3Service, s3Audio: S3AudioService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 7) {
            console.info("Upgrading database schema from version 7 to 8");

            // Set special memberOf field for group documents
            await db.processAllDocs([DocType.Group], async (doc: GroupDto) => {
                if (doc) {
                    doc.memberOf = [doc._id]; // Set special memberOf field for group documents to improve database query performance.
                    await db.upsertDoc(doc);
                }
            });

            // Update media field in PostDto and TagDto documents
            const groupQuery = await db.getGroups();
            const groupIds = groupQuery.docs.map((group: GroupDto) => group._id);

            await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
                if (!doc) {
                    return;
                }

                if (doc.error) {
                    console.error(`Unable to parse document: ${doc.parseError}`);
                    return;
                }

                if (
                    doc.type &&
                    (doc.type == "post" || doc.type == "tag") &&
                    (doc as PostDto | TagDto).media == undefined
                ) {
                    doc.media = new MediaDto();
                    doc.media.fileCollections = new Array<MediaFileDto>();
                }

                const changeReq = new ChangeReqDto();
                changeReq.id = 1;
                changeReq.doc = doc;

                try {
                    await processChangeRequest(
                        "Database schema upgrade from version 7 to 8",
                        changeReq,
                        groupIds,
                        db,
                        s3,
                        s3Audio,
                    );
                } catch (e) {
                    let message = e.message;
                    if (e.errors && e.errors.length > 0) {
                        message += "; " + e.errors.join("; ");
                    }
                    if (!message) message = e;
                    console.error(`Unable to process change request for ${doc._id}. ${message}`);
                }
            });

            await db.setSchemaVersion(8);
            console.info("Database schema upgrade from version 7 to 8 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v8: current version is ${schemaVersion}, expected 7`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 7 to 8 failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
