import { PostDto } from "../../dto/PostDto";
import { DbService } from "../db.service";
import { TagDto } from "../../dto/TagDto";
import { ImageDto } from "../../dto/ImageDto";
import { ImageUploadDto } from "../../dto/ImageUploadDto";
import { processChangeRequest } from "../../changeRequests/processChangeRequest";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { GroupDto } from "../../dto/GroupDto";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 2 to 3
 * Update image field to imageData field in PostDto and TagDto documents and upload images to S3
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 2) {
        console.info("Upgrading database schema from version 2 to 3");
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
            if (doc.type && (doc.type == "post" || doc.type == "tag")) {
                const d: PostDto | TagDto = doc;
                // @ts-expect-error - image is not defined in the dto, but it might still be in the database
                if (!d.imageData && d.image) {
                    try {
                        // @ts-expect-error - image is not defined in the dto, but it might still be in the database
                        const res = await fetch(d.image);
                        const buffer = Buffer.from(await res.arrayBuffer());
                        d.imageData = new ImageDto();
                        d.imageData.uploadData = [];
                        d.imageData.uploadData.push({
                            fileData: buffer,
                            preset: "photo",
                        } as unknown as ImageUploadDto);
                    } catch (e) {
                        // @ts-expect-error - image is not defined in the dto, but it might still be in the database
                        console.error(`Unable to download image ${d.image} for ${d._id}: ${e}`);
                    }
                }
                // @ts-expect-error - image is not defined in the dto, but it might still be in the database
                delete d.image;

                const changeReq = new ChangeReqDto();
                changeReq.doc = d;

                try {
                    await processChangeRequest(
                        "Database schema upgrade from version 2 to 3",
                        changeReq,
                        groupIds,
                        db,
                    );
                } catch (e) {
                    let message = e.message;
                    if (e.errors && e.errors.length > 0) {
                        message += "; " + e.errors.join("; ");
                    }
                    if (!message) message = e;
                    console.error(`Unable to process change request for ${d._id}. ${message}`);
                }
            }
        });
        await db.setSchemaVersion(3);
        console.info("Database schema upgrade from version 2 to 3 completed");
    }
}
