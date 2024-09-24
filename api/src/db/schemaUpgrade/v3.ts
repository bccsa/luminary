import { PostDto } from "../../dto/PostDto";
import { DbService } from "../db.service";
import { TagDto } from "../../dto/TagDto";
import { ImageDto } from "../../dto/ImageDto";
import { ImageUploadDto } from "../../dto/ImageUploadDto";
import { S3Service } from "../../s3/s3.service";
import { processChangeRequest } from "../../changeRequests/processChangeRequest";
import { ChangeReqDto } from "../../dto/ChangeReqDto";

/**
 * Upgrade the database schema from version 2 to 3
 * Add publishDateVisible field to PostDto and TagDto documents
 */
export default async function (db: DbService, s3: S3Service) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 2) {
        console.info("Upgrading database schema from version 2 to 3");
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
                if (d.imageData != undefined && d.image) {
                    try {
                        const res = await fetch(d.image);
                        const buffer = await res.arrayBuffer();
                        d.imageData = new ImageDto();
                        d.imageData.uploadData = [new ImageUploadDto()];
                        d.imageData.uploadData[0].fileData = buffer;
                    } catch (e) {
                        console.error(`Unable to download image: ${e}`);
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
                        ["group-super-admins"],
                        db,
                        s3,
                    );
                } catch (e) {
                    console.error(`Unable to process change request: ${e}`);
                }
            }
        });
        await db.setSchemaVersion(3);
        console.info("Database schema upgrade from version 2 to 3 completed");
    }
}
