# S3 Multi-Bucket Architecture

## Overview

Luminary CMS supports connecting to multiple S3-compatible storage buckets, allowing you to organize different types of content across separate storage locations. The system uses a generic S3 client that works with any S3-compatible service, including AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, and others.

## Key Benefits

- **Flexible Storage Organization**: Separate buckets for images, media, and other content types
- **Multiple Storage Providers**: Connect to any S3-compatible service simultaneously
- **Bucket-Specific Configuration**: Each bucket has its own settings and credentials
- **Secure Credential Storage**: All credentials are encrypted before storage

## Architecture

The system uses a bucket-based approach where:

- Each bucket is configured independently with its own credentials
- Buckets are categorized by type (Image, Media)
- The system can handle multiple storage providers simultaneously
- Credentials are encrypted and stored securely

## Bucket Types

- **Image**: For image uploads and processing
- **Media**: For audio, video, and other media files

Each bucket type can have multiple instances, allowing you to distribute content across different storage providers or regions.

## Configuration

### Creating a New Bucket

1. Navigate to **S3 Storage Overview** in the CMS
2. Click **Add Bucket**
3. Fill in:
   - **Name**: Descriptive name for your bucket
   - **Bucket Type**: Select Image or Media
   - **Public URL**: The public base URL for accessing files
   - **Allowed File Types**: Specify which file types this bucket accepts (e.g., `image/*`, `video/mp4`)
   - **S3 Credentials**:
     - **Endpoint**: S3-compatible endpoint URL (must include `http://` or `https://`)
     - **Bucket Name**: Actual bucket name on the S3 service
     - **Access Key**: S3 access key
     - **Secret Key**: S3 secret key

### Supported S3-Compatible Services

The system works with any S3-compatible storage service. Examples:

**AWS S3**:

```
Endpoint: https://s3.amazonaws.com
```

**Cloudflare R2**:

```
Endpoint: https://<account-id>.r2.cloudflarestorage.com
```

**MinIO** (for local development):

```
Endpoint: http://localhost:9000
```

**DigitalOcean Spaces**:

```
Endpoint: https://<region>.digitaloceanspaces.com
```

Any other service that implements the S3 API will work.

## Usage

### Selecting Buckets for Uploads

When uploading content:

- **Image Uploads**: Choose from available Image-type buckets
- **Media Uploads**: Choose from available Media-type buckets
- If only one bucket of a type exists, it's automatically selected

### Testing Bucket Connectivity

1. Navigate to S3 Storage Overview
2. Click **Test Connection** on any bucket
3. Status indicators show connection status

## Security

- All S3 credentials are encrypted before storage
- Credentials are never stored in plain text
- Bucket management requires appropriate permissions
- Test connections validate credentials without exposing them

**Best Practices**:

- Use dedicated S3 users with minimal required permissions
- Enable versioning on your S3 buckets
- Configure CORS properly for web access
- Use HTTPS endpoints whenever possible
- Regularly rotate access keys

## Development Setup

### Local MinIO Setup

For local development with MinIO:

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

## Troubleshooting

### Common Issues

**Connection Failed**:

- Check endpoint URL includes protocol (`http://` or `https://`)
- Verify credentials are correct
- Ensure endpoint is reachable
- Check bucket permissions

**Upload Failures**:

- Verify file type is allowed for the bucket
- Check bucket selection
- Monitor storage quota
- Review CORS settings

### Error Messages

| Error                       | Solution                                       |
| --------------------------- | ---------------------------------------------- |
| "No credentials configured" | Add credentials through bucket settings        |
| "Bucket unreachable"        | Check endpoint URL and network connectivity    |
| "Unauthorized"              | Verify access key and secret key               |
| "Bucket not found"          | Create bucket on S3 service or fix bucket name |

## API Reference

### Data Structures

#### StorageDto

```typescript
{
  _id: string;
  name: string;
  StorageType: 'image' | 'media';
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
