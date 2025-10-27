import { Controller, Post, Body, UseGuards, Headers } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { StorageService } from "./storage.service";
import { validateApiVersion } from "../validation/apiVersion";

export type BucketStatusCheckDto = {
    bucketId: string;
    apiVersion: string;
};

export type BucketStatusResponseDto = {
    bucketId: string;
    status: "connected" | "unreachable" | "unauthorized" | "not-found" | "no-credentials";
    message?: string;
};

@Controller("storage")
export class StorageController {
    constructor(private readonly storageService: StorageService) {}

    @Post("bucket-status")
    @UseGuards(AuthGuard)
    async checkBucketStatus(
        @Body() body: BucketStatusCheckDto,
        @Headers("Authorization") authHeader: string,
    ): Promise<BucketStatusResponseDto> {
        await validateApiVersion(body.apiVersion);
        const token = authHeader?.replace("Bearer ", "") ?? "";

        return this.storageService.checkBucketStatus(body.bucketId, token);
    }
}
