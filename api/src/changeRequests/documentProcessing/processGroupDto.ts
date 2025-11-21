import { GroupDto } from "../../dto/GroupDto";

/**
 * Process Group DTO
 */
export default async function processGroupDto(doc: GroupDto) {
    // set the memberOf field to contain its own ID to improve query performance
    doc.memberOf = [doc._id];
}
