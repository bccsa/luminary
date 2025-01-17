import { HttpException, HttpStatus } from "@nestjs/common";

// TODO: Implement API versioning
/**
 * Check if client has a valid api version, block interaction if version is not the same
 * @param apiVersion - client api version
 * @returns
 */
export const validateApiVersion = async (clientVersion: string) => {
    if (clientVersion != clientVersion) {
        throw new HttpException(
            "API version is outdated, please update your app",
            HttpStatus.BAD_REQUEST,
        );
    }
    return clientVersion == clientVersion;
};
