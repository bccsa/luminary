import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";

import {
  mockCategoryContentDto,
  mockCategoryDto,
  mockEnglishContentDto,
  mockFrenchContentDto,
  mockLanguageDtoEng,
  mockLanguageDtoFra,
  mockLanguageDtoSwa,
  mockPostDto,
} from "../tests/mockData";

import {
  DocType,
  TagType,
  type ContentDto,
  type PostDto,
  type TagDto,
} from "../types";
import { db } from "../db/database";
import waitForExpect from "wait-for-expect";

describe("baseDatabase.ts", () => {
  beforeEach(async () => {
    // seed the fake indexDB with mock datas
    await db.docs.bulkPut([mockPostDto]);
    await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
    await db.docs.bulkPut([
      mockLanguageDtoEng,
      mockLanguageDtoFra,
      mockLanguageDtoSwa,
    ]);
    await db.docs.bulkPut([mockCategoryDto, mockCategoryContentDto]);
  });

  afterEach(async () => {
    // Clear the database after each test
    await db.docs.clear();
    await db.localChanges.clear();
  });

  it("can generate a V4 UUID", async () => {
    const uuid = db.uuid();
    const verified = uuid.match(
      /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i
    );

    expect(verified![0]).toBe(uuid);
  });

  it("can convert a Dexie query to a Vue ref", async () => {
    const posts = db.toRef(
      () => db.docs.where("_id").equals(mockPostDto._id).toArray(),
      []
    );

    await waitForExpect(() => {
      expect(posts.value).toEqual([mockPostDto]);
    });
  });

  it("can get a document by its id", async () => {
    const post = await db.get<ContentDto>(mockPostDto._id);

    expect(post).toEqual(mockPostDto);
  });

  it("can get a document as a ref by its id", async () => {
    const post = db.getAsRef<ContentDto>(mockPostDto._id);

    await waitForExpect(() => {
      expect(post.value).toEqual(mockPostDto);
    });
  });

  it("returns the initial value of a ref while waiting for the query to complete", async () => {
    const post = db.getAsRef<PostDto>(mockPostDto._id, mockPostDto);

    expect(post.value).toEqual(mockPostDto);
  });

  it("can get all documents of a certain type as a ref", async () => {
    const posts = db.whereTypeAsRef<PostDto[]>(DocType.Post);

    await waitForExpect(() => {
      expect(posts.value).toEqual([mockPostDto]);
    });
  });

  it("can get all documents of a certain type as a ref filtered by tag type", async () => {
    const posts = db.whereTypeAsRef<TagDto[]>(
      DocType.Tag,
      undefined,
      TagType.Category
    );

    await waitForExpect(() => {
      expect(posts.value).toEqual([mockCategoryDto]);
    });
  });

  it("can get documents by their parentId", async () => {
    const postContent = await db.whereParent<PostDto[]>(
      mockPostDto._id,
      DocType.Post
    );

    expect(postContent.some((c) => c._id == mockEnglishContentDto._id)).toBe(
      true
    );
    expect(postContent.some((c) => c._id == mockFrenchContentDto._id)).toBe(
      true
    );
  });

  it("can get documents by their parentId as a ref", async () => {
    const postContent = db.whereParentAsRef<PostDto[]>(
      mockPostDto._id,
      DocType.Post
    );

    await waitForExpect(() => {
      expect(
        postContent.value.some((c) => c._id == mockEnglishContentDto._id)
      ).toBe(true);
      expect(
        postContent.value.some((c) => c._id == mockFrenchContentDto._id)
      ).toBe(true);
    });
  });

  it("can detect if a local change is queued for a given document ID", async () => {
    const isLocalChange = db.isLocalChangeAsRef(mockPostDto._id);
    await db.upsert(mockPostDto);

    await waitForExpect(() => {
      expect(isLocalChange.value).toBe(true);
    });
  });

  it("can upsert a document into the database and queue the change to be sent to the API", async () => {
    await db.upsert(mockPostDto);
    const isLocalChange = db.isLocalChangeAsRef(mockPostDto._id);

    // Check if the local change is queued
    await waitForExpect(async () => {
      expect(isLocalChange.value).toBe(true);

      const localChange = await db.localChanges
        .where("docId")
        .equals(mockPostDto._id)
        .first();
      expect(localChange?.doc).toEqual(mockPostDto);
    });

    // Check if the document is in the database
    const post = await db.get<PostDto>(mockPostDto._id);
    expect(post).toEqual(mockPostDto);
  });
});
