import { Controller, Headers, Get } from "@nestjs/common";
import { GroupsReqDto } from "../dto/EndpointsReqDto";
import { GroupsService } from "./groups.service";
import { xQuery } from "../validation/x-query";
import { validateApiVersion } from "../validation/apiVersion";

@Controller("groups")
export class GroupsController {
    constructor(private readonly groupsService: GroupsService) {}

    @Get()
    async getDocs(
        @Headers("X-Query") query: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        const queryObj = xQuery(query, GroupsReqDto);
        await validateApiVersion(queryObj.apiVersion); // validate API version

        return this.groupsService.processReq(auth !== undefined ? auth.replace("Bearer ", "") : "");
    }
}
