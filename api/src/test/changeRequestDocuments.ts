// This file generates the documents for the change request tests some random data

import { S3BucketDto } from "../dto/S3BucketDto";
import { ContentDto } from "../dto/ContentDto";

function randomString() {
    return Math.random().toString(36).substring(7);
}

export const changeRequest_post = () => {
    return {
        id: 42,
        doc: {
            _id: "post-blog1",
            type: "post",
            memberOf: ["group-public-content"],
            image: randomString(),
            tags: ["tag-category1", "tag-topicA"],
            publishDateVisible: true,
            postType: "blog",
            deleteReq: 0,
            imageBucketId: "storage-bucket-1",
        },
    };
};
export const changeRequest_tag = () => {
    return {
        id: 43,
        doc: {
            _id: "test-tag-1",
            type: "tag",
            memberOf: ["group-public-content"],
            tagType: "topic",
            pinned: 0,
            image: randomString(),
            tags: [],
            publishDateVisible: false,
        },
    };
};
export const changeRequest_content = () => {
    return {
        id: 44,
        doc: {
            _id: "content-blog1-eng",
            type: "content",
            memberOf: ["group-public-content"],
            parentId: "post-blog1",
            language: "lang-eng",
            status: "published",
            slug: "test-blog1-eng",
            title: "Blog 1",
            summary: "This is a test blog",
            author: "",
            text: "Test content",
            seo: "",
            localisedImage: randomString(),
            audio: "",
            video: "",
            publishDate: 1704114000000,
            expiryDate: 1704114000000,
            parentImageBucketId: "storage-bucket-1",
        } as ContentDto,
    };
};
export const changeRequest_language = () => {
    return {
        id: 45,
        doc: {
            _id: "test-lang-eng",
            type: "language",
            memberOf: ["group-languages"],
            languageCode: "test-eng",
            name: "test-English" + randomString(),
            default: 0,
            translations: {
                stringTranslation: "String Translation",
            },
        },
    };
};
export const changeRequest_group = () => {
    return {
        id: 46,
        doc: {
            _id: "group-languages",
            type: "group",
            name: "Languages" + randomString(),
            acl: [
                {
                    type: "language",
                    groupId: "group-public-content",
                    permission: ["view"],
                },
                {
                    type: "language",
                    groupId: "group-private-content",
                    permission: ["view"],
                },
                {
                    type: "language",
                    groupId: "group-public-editors",
                    permission: ["view", "translate"],
                },
                {
                    type: "language",
                    groupId: "group-private-editors",
                    permission: ["view", "translate"],
                },
            ],
        },
    };
};

export const changeRequest_storage = () => {
    return {
        id: 47,
        doc: {
            _id: "storage-bucket-1",
            type: "storage",
            memberOf: ["group-storage-admins"],
            name: "testStorageBucket",
            publicUrl: "https://s3.example.com/testStorageBucket/",
            fileTypes: ["image/*", "audio/*"],
            credential: {
                endpoint: "http://example.com",
                accessKey: "accessAdminKey",
                secretKey: "secretAdminKey",
            },
            credential_id: undefined,
        } as S3BucketDto,
    };
};
