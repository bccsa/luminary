import { PostDto } from "../../dto/PostDto";
import { DbService } from "../db.service";
import { TagDto } from "../../dto/TagDto";
import { ImageDto } from "../../dto/ImageDto";
import { ImageUploadDto } from "../../dto/ImageUploadDto";
import { S3Service } from "../../s3/s3.service";
import { processChangeRequest } from "../../changeRequests/processChangeRequest";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { GroupDto } from "src/dto/GroupDto";

/**
 * Upgrade the database schema from version 2 to 3
 * Add publishDateVisible field to PostDto and TagDto documents
 */
export default async function (db: DbService, s3: S3Service) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 2) {
        console.info("Upgrading database schema from version 2 to 3");
        const groupQuery = await db.getGroups();
        const groupIds = groupQuery.docs.map((group: GroupDto) => group._id);

        await db.processAllDocs(async (doc: any) => {
            if (!doc) {
                return;
            }
            if (doc.error) {
                console.error(`Unable to parse document: ${doc.parseError}`);
                return;
            }
            if (doc.type && (doc.type == "post" || doc.type == "tag")) {
                const d: PostDto | TagDto = doc;
                if (!d.imageData && d.image) {
                    try {
                        const res = await fetch(d.image);
                        const buffer = Buffer.from(await res.arrayBuffer());
                        d.imageData = new ImageDto();
                        d.imageData.uploadData = [];
                        d.imageData.uploadData.push({
                            fileData: buffer,
                            preset: "photo",
                        } as ImageUploadDto);
                    } catch (e) {
                        console.error(`Unable to download image ${d.image} for ${d._id}: ${e}`);
                    }
                }
                delete d.image;

                const changeReq = new ChangeReqDto();
                changeReq.id = 1;
                changeReq.doc = d;

                try {
                    await processChangeRequest(
                        "Database schema upgrade from version 2 to 3",
                        changeReq,
                        groupIds,
                        db,
                        s3,
                    );
                } catch (e) {
                    let message = e.message;
                    if (e.errors && e.errors.length > 0) {
                        message += "\n" + e.errors.join("\n");
                    }
                    console.error(`Unable to process change request for ${d._id}. ${message}`);
                }
            }
        });
        await db.setSchemaVersion(3);
        console.info("Database schema upgrade from version 2 to 3 completed");
    }
}
