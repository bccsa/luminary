# S3 Multi-Bucket Architecture Proposal

## Overview

This document explains the proposed migration from a single-bucket S3 architecture to a flexible multi-bucket system that can handle different content types (images, documents, videos, etc.) with bucket-specific configurations.

## Current Architecture (Single Bucket)

### Structure

```
S3Config → S3Service → Minio Client → Image Bucket
```

### Current Configuration

The existing `S3Config` contains:

- `endpoint` - S3/MinIO server endpoint
- `port` - Connection port
- `credentials` - Access keys and Secret keys
- `imageBucket` - Single hard-coded bucket name for images
- `imageQuality` - Image-specific quality setting

### Limitations ❌

1. **Only images supported** - The service is tightly coupled to image handling
2. **Hard-coded bucket name** - No flexibility for different content types
3. **Cannot handle documents, videos, etc.** - Limited to single use case
4. **No bucket isolation** - All content must go in one bucket
5. **imageQuality tied to service** - Configuration not extensible for other content types

## Proposed Architecture (Multi-Bucket)

### Structure

```
S3Config → S3Service (Generic) → Bucket Manager (Registry) → Minio Client → Multiple Buckets
                                                                              ├─ Images Bucket
                                                                              ├─ Documents Bucket
                                                                              ├─ Videos Bucket
                                                                              └─ Other/Custom Buckets
```

### Key Components

#### 1. BucketConfig Interface

Defines the configuration for each bucket type:

```typescript
type BucketConfig = {
  name: string; // Actual bucket name in S3/MinIO
  options?: {
    imageQuality?: number; // For image buckets
    maxSize?: number; // Max file size in bytes
    allowedTypes?: string[]; // Allowed MIME types
    // ... other custom settings
  };
};
```

#### 2. BucketManager Class

Acts as a registry for bucket configurations:

```typescript
class BucketManager {
  register(type: string, config: BucketConfig): void;
  getBucket(type: string): BucketConfig;
  listBuckets(): string[];
  hasBucket(type: string): boolean;
}
```

**Responsibilities:**

- Stores bucket configurations
- Provides type-safe access to bucket settings
- Validates bucket existence
- Manages bucket registry

#### 3. Updated S3Service Methods

The service becomes generic and accepts a `bucketType` parameter:

```typescript
class S3Service {
  // New multi-bucket methods
  uploadFile(bucketType: string, key: string, file: Buffer): Promise<void>;
  getObject(bucketType: string, key: string): Promise<Buffer>;
  removeObjects(bucketType: string, keys: string[]): Promise<void>;
  validateUpload(bucketType: string, key: string): Promise<boolean>;
  checkAccessibility(
    bucketType: string,
    keys: string[]
  ): Promise<Map<string, boolean>>;

  // Backward compatibility
  get imageBucket(): string; // Returns 'images' bucket name
}
```

### Configuration Example

Environment variable using JSON structure:

```json
S3_BUCKETS={
  "images": {
    "name": "luminary-images",
    "imageQuality": 80
  },
  "documents": {
    "name": "luminary-audios",
    "maxSize": 10485760
  },
  "videos": {
    "name": "luminary-videos"
  }
}
```

Or separate environment variables:

```bash
S3_BUCKET_IMAGES_NAME=luminary-images
S3_BUCKET_IMAGES_QUALITY=80
S3_BUCKET_DOCUMENTS_NAME=luminary-docs
S3_BUCKET_DOCUMENTS_MAX_SIZE=10485760
S3_BUCKET_VIDEOS_NAME=luminary-videos
```

### Usage Example

#### Old Way (Still Works - Backward Compatible)

```typescript
await s3Service.uploadFile(
  s3Service.imageBucket,
  "profile-pic.jpg",
  imageBuffer
);
```

#### New Way

```typescript
// Upload an image
await s3Service.uploadFile("images", "profile-pic.jpg", imageBuffer);

// Upload a document
await s3Service.uploadFile("audios", "audio.mp3", audioBuffer);

// Upload a video
await s3Service.uploadFile("videos", "tutorial.mp4", videoBuffer);
```

## Benefits ✅

1. **Support multiple content types** - Images, audios, videos, and custom types
2. **Bucket-specific configs** - Each bucket can have its own settings (quality, size limits, etc.)
3. **Easy to add new buckets** - Simply register a new bucket configuration
4. **Better separation of concerns** - Content types are isolated in their own buckets
5. **Type-safe bucket access** - Use enums or constants for bucket types
6. **Backward compatible** - Existing code continues to work without changes

## Migration Strategy

### Phase 1: Foundation

1. Create `BucketConfig` type/interface
2. Implement `BucketManager` class
3. Update `S3Config` to support multiple buckets

### Phase 2: Service Update

4. Add `bucketType` parameter to S3Service methods
5. Keep existing `imageBucket` getter for backward compatibility
6. Default to `'images'` bucket if `bucketType` not specified

### Phase 3: Gradual Migration

7. Update new code to use bucket types
8. Gradually migrate existing consumers
9. Add deprecation warnings to single-bucket methods

### Phase 4: Cleanup

10. Remove deprecated methods (breaking change - major version)
11. Update all documentation

## Testing Considerations

When implementing this architecture, ensure:

- ✅ **Mock multiple buckets** - Test with various bucket configurations
- ✅ **Test bucket isolation** - Verify files go to correct buckets
- ✅ **Test backward compatibility** - Ensure old code still works
- ✅ **Test config validation** - Invalid configurations should fail gracefully
- ✅ **Test bucket registration** - Dynamic bucket addition/removal
- ✅ **Test error handling** - Missing buckets, invalid types, etc.

## Implementation Checklist

- [ ] Define `BucketConfig` interface in `shared` package
- [ ] Create `BucketManager` class
- [ ] Update `S3Config` to accept bucket configurations
- [ ] Refactor `S3Service` to use `BucketManager`
- [ ] Add bucket type enum/constants
- [ ] Update environment variable parsing
- [ ] Add unit tests for `BucketManager`
- [ ] Add integration tests for multi-bucket scenarios
- [ ] Update API endpoints to accept bucket types
- [ ] Update documentation
- [ ] Create migration guide for consumers
- [ ] Deploy and monitor

## Type Safety Enhancement

Consider adding bucket type enums:

```typescript
enum BucketType {
  IMAGES = "images",
  VIDEOS = "videos",
  AUDIO = "audio",
  ARCHIVES = "archives",
}

// Usage with type safety
await s3Service.uploadFile(BucketType.DOCUMENTS, "contract.pdf", pdfBuffer);
```

## Future Enhancements

- **Bucket-level access control** - Different permissions per bucket
- **Bucket-specific lifecycle policies** - Auto-delete old files
- **Content type validation** - Enforce allowed MIME types per bucket
- **Storage class selection** - Hot/cold storage per bucket
- **Cross-bucket operations** - Move/copy between buckets
- **Bucket analytics** - Track usage per content type
- **CDN integration** - Per-bucket CDN configurations

## Questions & Answers

### Q: Will this break existing code?

**A:** No, backward compatibility is maintained through the `imageBucket` getter and default parameters.

### Q: How do I add a new bucket type?

**A:** Simply add the configuration to your environment variables and register it with the `BucketManager`.

### Q: Can buckets have different S3 providers?

**A:** Not in the initial implementation, but this could be added later by extending `BucketConfig`.

### Q: What about bucket creation?

**A:** Buckets should be created during deployment/initialization. The service can optionally auto-create missing buckets in development.

## Related Documentation

- [S3 Multi-Bucket Architecture Diagram](./s3-multi-bucket-architecture.drawio)
- [REST API Documentation](./restApi.md)
- [Setup Vue App Guide](./setup-vue-app.md)

## References

- [MinIO Multi-Bucket Best Practices](https://min.io/docs/minio/linux/administration/console/managing-objects.html)
- [AWS S3 Multi-Bucket Strategies](https://aws.amazon.com/s3/features/)
- [NestJS Configuration Module](https://docs.nestjs.com/techniques/configuration)
