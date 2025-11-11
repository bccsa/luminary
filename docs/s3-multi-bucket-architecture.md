# S3 Multi-Bucket Architecture

## Overview

Luminary CMS now supports connecting to multiple S3-compatible storage buckets, allowing you to organize different types of content across separate storage locations. This new architecture provides greater flexibility, better organization, and the ability to use different storage providers for different content types.

## Key Benefits

- **Flexible Storage Organization**: Separate buckets for images, media, and other content types
- **Multiple Storage Providers**: Connect to different S3-compatible services (AWS S3, MinIO, Cloudflare R2, etc.)
- **Bucket-Specific Configuration**: Each bucket can have its own settings and credentials
- **Easy Migration**: Move content between buckets as needed
- **Backward Compatibility**: Existing single-bucket setups continue to work

## Architecture Overview

The new system replaces the single S3 configuration with a bucket-based approach where:

- Each bucket is configured independently with its own credentials
- Buckets are categorized by type (Image, Media)
- The system can handle multiple storage providers simultaneously
- Credentials are encrypted and stored securely

### Before vs After

**Before (Single Bucket)**:

```
S3Config
├── endpoint
├── credentials
└── imageBucket (single)
```

**After (Multi-Bucket)**:

```
Multiple S3BucketDto
├── Bucket 1 (Images)
│   ├── Own credentials
│   ├── Own endpoint
│   └── Type: Image
├── Bucket 2 (Media)
│   ├── Own credentials
│   ├── Own endpoint
│   └── Type: Media
└── Bucket N (Custom)
    ├── Own credentials
    ├── Own endpoint
    └── Type: Custom
```

## Bucket Types

The system currently supports these bucket types:

- **Image**: For image uploads and processing
- **Media**: For audio, video, and other media files

Each bucket type can have multiple instances, allowing you to distribute content across different storage providers or regions.

## Configuration Guide

### Accessing S3 Management

1. Navigate to the CMS interface
2. Go to **S3 Storage Overview** page
3. Click **Add Bucket** to create a new bucket configuration

### Creating a New Bucket

1. **Basic Information**:

   - **Name**: Descriptive name for your bucket (displayed in CMS)
   - **Bucket Type**: Select Image or Media
   - **Public URL**: The public base URL for accessing files
   - **Allowed File Types**: Specify which file types this bucket accepts

2. **S3 Credentials**:
   - **Endpoint**: S3-compatible endpoint URL
   - **Bucket Name**: Actual bucket name on the S3 service
   - **Access Key**: S3 access key
   - **Secret Key**: S3 secret key

### Supported Storage Providers

#### MinIO (Development)

```
Endpoint: http://localhost:9000
Bucket Name: your-bucket-name
Access Key: minio
Secret Key: minio123
```

#### AWS S3

```
Endpoint: https://s3.amazonaws.com
Bucket Name: your-aws-bucket
Access Key: your-aws-access-key
Secret Key: your-aws-secret-key
```

#### Cloudflare R2

```
Endpoint: https://<account-id>.r2.cloudflarestorage.com
Bucket Name: your-r2-bucket
Access Key: your-r2-access-key
Secret Key: your-r2-secret-key
```

### Configuration Examples

#### Example 1: Separate Providers for Different Content

```
Image Bucket (AWS S3):
├── Name: "Production Images"
├── Type: Image
├── Endpoint: https://s3.amazonaws.com
├── Bucket: luminary-images-prod
└── File Types: [image/jpeg, image/png, image/webp]

Media Bucket (Cloudflare R2):
├── Name: "Media Files"
├── Type: Media
├── Endpoint: https://account.r2.cloudflarestorage.com
├── Bucket: luminary-media
└── File Types: [audio/*, video/*]
```

#### Example 2: Geographic Distribution

```
Images US East:
├── Name: "Images US"
├── Type: Image
├── Endpoint: https://s3.us-east-1.amazonaws.com
└── Bucket: luminary-images-us

Images EU:
├── Name: "Images EU"
├── Type: Image
├── Endpoint: https://s3.eu-west-1.amazonaws.com
└── Bucket: luminary-images-eu
```

## Security Considerations

### Credential Encryption

- All S3 credentials are encrypted before storage
- Credentials are never stored in plain text

### Access Control

- Bucket management requires appropriate permissions
- Users need `Storage` permissions to create/edit buckets
- Test connections validate credentials without exposing them

### Best Practices

1. **Use dedicated S3 users** with minimal required permissions
2. **Enable versioning** on your S3 buckets for data protection
3. **Configure CORS** properly for web access
4. **Use HTTPS endpoints** whenever possible
5. **Regularly rotate access keys**

## Usage Guide

### Selecting Buckets for Uploads

When uploading content through the CMS:

1. **Image Uploads**: Choose from available Image-type buckets
2. **Media Uploads**: Choose from available Media-type buckets
3. **Default Selection**: The system remembers your last selection

- If you have only one bucket configured in the CMS, it will be selected automatically while uploading images or medias

### Testing Bucket Connectivity

1. Navigate to S3 Storage Overview
2. Find your bucket in the list
3. Click **Test Connection** to verify connectivity
4. Status indicators show:
   - ✅ Connected
   - ❌ Connection Error
   - ⚠️ No Credentials
   - 🔄 Testing

### Managing Existing Content

#### Moving Content Between Buckets

The system supports migrating content between buckets:

1. Edit the content item (image, media, etc.)
2. Select a different bucket from the dropdown
3. The system will automatically migrate files
4. Old files are removed from the previous bucket

#### Bucket Status Monitoring

- Real-time connection status for each bucket
- Automatic retry on connection failures
- Error logging for troubleshooting

## Development Setup

### Local MinIO Setup

For development, you can run MinIO locally:

```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name luminary-storage \
  -e "MINIO_ACCESS_KEY=minio" \
  -e "MINIO_SECRET_KEY=minio123" \
  quay.io/minio/minio server /data --console-address ":9001"
```

Access MinIO console at: http://localhost:9001

### Creating Test Buckets

1. Access MinIO console
2. Create buckets: `test-images`, `test-media`
3. Configure public access policies if needed
4. Add bucket configurations in CMS

### Environment Variables

The API no longer requires global S3 configuration. Individual bucket credentials are managed through the CMS interface.

Optional settings:

```bash
# Image processing quality (0-100, default: 80)
S3_IMG_QUALITY=80

# Encryption key for credential storage
ENCRYPTION_KEY=your-secure-encryption-key
```

## Migration from Single Bucket

### Automatic Migration

The system maintains backward compatibility:

1. Existing single-bucket configurations continue to work
2. Legacy image uploads use the default image bucket
3. New multi-bucket features are opt-in

### Manual Migration Steps

To fully migrate to the new system:

1. **Create new bucket configurations** through the CMS
2. **Test connectivity** for all new buckets
3. **Gradually migrate content** using the bucket selection interface
4. **Verify all content** is accessible in new buckets
5. **Remove old configuration** once migration is complete

## Troubleshooting

### Common Issues

#### Connection Failed

- **Check endpoint URL**: Must include protocol (http:// or https://)
- **Verify credentials**: Access key and secret key must be correct
- **Test network connectivity**: Ensure the endpoint is reachable
- **Check bucket permissions**: User must have read/write access

#### Upload Failures

- **Verify file types**: Check if file type is allowed for the bucket
- **Check bucket selection**: Ensure appropriate bucket is selected
- **Monitor storage quota**: Verify bucket has sufficient space
- **Review CORS settings**: Ensure web uploads are permitted

#### Performance Issues

- **Check endpoint location**: Use geographically close endpoints
- **Monitor bandwidth**: Large files may need optimization
- **Consider CDN**: Use CloudFront or similar for better performance

### Error Messages

| Error                       | Cause                        | Solution                                       |
| --------------------------- | ---------------------------- | ---------------------------------------------- |
| "No credentials configured" | Bucket has no S3 credentials | Add credentials through bucket settings        |
| "Bucket unreachable"        | Network/endpoint issue       | Check endpoint URL and network connectivity    |
| "Unauthorized"              | Invalid credentials          | Verify access key and secret key               |
| "Bucket not found"          | Bucket doesn't exist         | Create bucket on S3 service or fix bucket name |

### Debug Information

Enable debug logging by checking browser console for:

- Bucket connection attempts
- Upload progress
- Error details
- API response information

## API Reference

### Bucket Configuration Endpoints

- `GET /storage/buckets` - List all configured buckets
- `POST /storage/buckets` - Create new bucket configuration
- `PUT /storage/buckets/:id` - Update bucket configuration
- `DELETE /storage/buckets/:id` - Remove bucket configuration
- `POST /storage/bucket-status` - Test bucket connectivity

### Data Structures

#### S3BucketDto

```typescript
{
  _id: string;
  name: string;
  bucketType: 'image' | 'media';
  publicUrl: string;
  mimeTypes: string[];
  credential?: S3CredentialDto;
  credential_id?: string;
}
```

#### S3CredentialDto

```typescript
{
  endpoint: string;
  bucketName: string;
  accessKey: string;
  secretKey: string;
}
```

## Support

For issues or questions about the S3 multi-bucket system:

1. Check the troubleshooting section above
2. Review browser console for error messages
3. Verify bucket connectivity through the CMS interface
4. Check S3 service logs for additional information

The multi-bucket system is designed to be flexible and accommodate various storage needs while maintaining security and ease of use.
