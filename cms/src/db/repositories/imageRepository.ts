import { ImageDto, Uuid, Image, DocType, ImageUploadDto } from "@/types";
import { BaseRepository } from "./baseRepository";
import { v4 as uuidv4 } from "uuid";
import { db } from "../baseDatabase";
import { useObservable } from "@vueuse/rxjs";
import { liveQuery } from "dexie";

export class ImageRepository extends BaseRepository {
    find(id: Uuid) {
        return this.fromDto(this.whereId(id).first() as unknown as ImageDto);
    }

    async getAll() {
        this.whereType(DocType.Image).toArray((dtos) => {
            Promise.all(this.fromDtos(dtos as ImageDto[]));
        });
    }
    // getAll = useObservable (
    //     liveQuery(async () => {
    //         return (await this.whereType(DocType.Image).toArray())?.map((dto) =>
    //             this.fromDto(dto as ImageDto),
    //         );
    //     })
    // )

    async create(UploadData?: ImageUploadDto) {
        const imageId = uuidv4();
        const image: ImageDto = {
            _id: imageId,
            updatedTimeUtc: Date.now(),
            type: DocType.Image,
            name: "",
            description: "",
            files: [],
            uploadData: UploadData,
            memberOf: [],
        };

        await db.docs.put(image);

        // Save change, will be sent to the API later
        await db.localChanges.put({
            doc: image,
        });

        return imageId;
    }

    async update(image: Image) {
        const imageDto = this.toDto(image);
        await db.docs.put(imageDto);

        // Save change, will be sent to the API later
        await db.localChanges.put({
            doc: imageDto,
        });
    }

    private fromDto(dto: ImageDto) {
        const image = this.fromBaseDto<Image>(dto);
        return image;
    }

    private fromDtos(dtos: ImageDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private toDto(image: Image) {
        const imageDto = this.toBaseDto<ImageDto>(image);
        return imageDto;
    }
}
