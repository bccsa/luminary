import { type ImageDto, type Uuid, type Image, DocType } from "@/types";
import { BaseRepository } from "./baseRepository";
import { v4 as uuidv4 } from "uuid";
import { db } from "../baseDatabase";
import { useObservable } from "@vueuse/rxjs";
import { liveQuery } from "dexie";
import type { Observable } from "rxjs";
import type { Ref } from "vue";

export class ImageRepository extends BaseRepository {
    async find(id: Uuid) {
        const res = (await this.whereId(id).first()) as unknown as ImageDto;
        return this.fromDto(res);
    }

    getAll: Readonly<Ref<Image[] | undefined>> = useObservable(
        liveQuery(() =>
            this.whereType(DocType.Image).toArray((dtos) => {
                Promise.all(this.fromDtos(dtos as ImageDto[]));
            }),
        ) as unknown as Observable<Image[]>,
    );

    new(): Image {
        return this.fromDto({
            _id: uuidv4(),
            updatedTimeUtc: Date.now(),
            type: DocType.Image,
            name: "New Image",
            description: "",
            files: [],
            memberOf: ["group-private-content"], // TODO set right group
        });
    }

    async upsert(image: Image) {
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
