# S3 Multi-Bucket Storage Guide

A simple guide to managing your storage buckets in Luminary CMS.

## What is a Storage Bucket?

A storage bucket is a container for your files (images, videos, documents). Think of it like different folders on different cloud storage services. You can have multiple buckets, each with its own:

- Storage location (different S3/MinIO services)
- Access rules (who can use it)
- File type restrictions (what kinds of files are allowed)

## Why Use Multiple Buckets?

- **Organize by purpose**: Separate user profile pictures from article images
- **Different providers**: Use different cloud storage services for different content
- **Access control**: Restrict certain buckets to specific user groups
- **File type control**: Only allow certains file type in some buckets
- **Migration**: Gradually move content from one storage service to another

---

## Managing Buckets

### Viewing Your Buckets

1. Go to **Storage** in the CMS sidebar
2. You'll see all configured buckets with their:
   - Name and description
   - Connection status (✅ Connected / ⚠️ Disconnected)
   - Bucket type (Image, Media, etc.)
   - Allowed file types
   - Access groups

### Creating a New Bucket

1. Click the **Add Bucket** button (top right on desktop, + icon on mobile)
2. Fill in the bucket details:

**Basic Information:**

- **Name**: A friendly name (e.g., "User Avatars", "Article Images")
- **Description**: Optional explanation of what this bucket is for
- **Bucket Type**: Choose Image or Media
- **File Types**: Specify what files are allowed (e.g., `image/*` for all images, `image/jpeg` for only JPEGs)

**Storage Configuration:**

- **Endpoint**: Your S3/MinIO server URL (e.g., `https://s3.amazonaws.com`)
- **Region**: Server region (e.g., `us-east-1`)
- **Bucket Name**: The actual bucket name on S3/MinIO
- **Access Key ID**: Your S3 access key
- **Secret Access Key**: Your S3 secret key
- **HTTP Path**: The public URL path for accessing files

**Access Control:**

- **Groups**: Select which user groups can use this bucket

3. Click **Save** to create the bucket

The system will automatically verify the connection when you save. If there's a problem with the settings, you'll see an error message.

### Editing a Bucket

1. Find the bucket in the Storage page
2. Click the **Edit** button (pencil icon)
3. Update any settings
4. Click **Save**

The connection status will update automatically after saving.

### Deleting a Bucket

1. Find the bucket in the Storage page
2. Click the **Delete** button (trash icon)
3. Confirm deletion

⚠️ **Warning**: Deleting a bucket configuration doesn't delete the files from S3/MinIO. It only removes the configuration from Luminary. Any content using this bucket may no longer display properly.

---

## Using Buckets for Content

### Uploading Images

When you upload an image (in post editor, image editor, etc.):

1. **Select a bucket** from the dropdown

   - Only buckets you have access to will appear
   - Only buckets that accept the file type will be shown
   - File type restrictions are displayed under the bucket name

2. **Choose your file**

   - The file picker will only show compatible file types
   - If the file doesn't match the bucket's restrictions, upload will fail

3. **Upload**
   - The file is uploaded to the selected bucket
   - You'll see a preview of the uploaded image

### File Type Restrictions

Buckets can limit what file types are allowed:

- **`image/*`** - All image formats (JPEG, PNG, GIF, WebP, etc.)
- **`image/jpeg`** - Only JPEG images
- **`image/png`** - Only PNG images
- **`video/*`** - All video formats
- **`video/mp4`** - Only MP4 videos
- **Multiple types** - e.g., `image/jpeg, image/png, image/webp`
- **No restrictions** - Leave empty to allow all files

### Moving Content Between Buckets

If you need to move content from one bucket to another:

1. Edit the content item (post, image, etc.)
2. Re-upload the file, selecting the new bucket
3. Save the content

The system will:

- Upload to the new bucket
- Update references to point to the new location
- The old file will be deleted only after a successfull object transfert to the original bucket

---

## Troubleshooting

### Bucket Shows "Disconnected"

The CMS couldn't connect to the S3/MinIO server. Common causes:

- **Wrong credentials**: Check Access Key ID and Secret Access Key
- **Wrong endpoint**: Verify the endpoint URL is correct
- **Network issues**: The S3 server might be down or unreachable
- **Bucket doesn't exist**: Create the bucket in S3 Storage section first

**Fix**: Click **Edit**, verify all settings, then **Save**. The connection status will update automatically.

You can also check the bagde of the bucket on the overview bucket page.

### Can't Upload Files

Possible reasons:

- **No bucket selected**: Choose a bucket from the dropdown
- **Wrong file type**: The file doesn't match the bucket's allowed types
- **No access**: You're not in a group that has access to the bucket
- **Bucket disconnected**: The bucket configuration has connection issues

### File Upload Fails

- **Check file type**: Make sure it matches the bucket's restrictions
- **Check file size**: Very large files may timeout
- **Check bucket capacity**: S3/MinIO might be full
- **Check permissions**: Your S3 credentials need write access

### Can't See a Bucket

- **Group access**: You might not be in a group with access to that bucket
- **Wrong bucket type**: Image buckets don't appear when uploading media
- **Bucket deleted**: The bucket configuration may have been removed

---

## Best Practices

### Naming Buckets

Use clear, descriptive names:

- ✅ "User Profile Pictures"
- ✅ "Article Featured Images"
- ✅ "Video Content"
- ❌ "Bucket1"
- ❌ "Test"

### File Type Restrictions

- Use wildcards (`image/*`) for flexibility
- Use specific types (`image/jpeg`) for strict control
- Leave empty only if you need to accept any file type
- Document why you allow/restrict certain types in the description

### Access Control

- Create separate buckets for different user groups when needed
- Don't give everyone access to every bucket
- Use descriptive group names

### Credentials Security

- Never share S3 credentials
- Use different credentials for each bucket
- Use the minimum necessary permissions (read/write/list)

### Migration Strategy

When moving to a new storage provider:

1. Create the new bucket configuration
2. Test thoroughly with a few files
3. Gradually migrate content in batches
4. Verify all content works from the new bucket
5. Keep old bucket configuration until migration is complete
6. Delete old bucket configuration only after confirming everything works

---

## Common Scenarios

### Scenario 1: Different Storage for Users vs Content

**Setup:**

- Bucket 1: "User Avatars" (small, low-cost S3 provider)
- Bucket 2: "Article Images" (CDN-enabled S3 provider)

**Why:** User avatars are small and don't change often. Article images are viewed frequently and benefit from CDN caching.

### Scenario 2: Migrating Storage Providers

**Setup:**

- Keep old bucket: "Images (Old Provider)"
- Add new bucket: "Images (New Provider)"

**Process:**

1. Upload new content to new bucket
2. Gradually re-upload old content to new bucket
3. Monitor usage of old bucket
4. Remove old bucket when no longer used

### Scenario 3: Multi-Tenant Application

**Setup:**

- Bucket per client: "Client A Images", "Client B Images"
- Group access per client

**Why:** Completely isolate content between clients, each with their own storage.

### Scenario 4: Content Type Separation

**Setup:**

- "Photos" bucket - Only `image/*`
- "Videos" bucket - Only `video/*`
- "Documents" bucket - PDFs, Word docs, etc.

**Why:** Different optimization, processing, and storage strategies for different content types.

---

## FAQ

**Q: Can I have unlimited buckets?**  
A: Yes, there's no limit on how many bucket configurations you can create.

**Q: What happens to files if I delete a bucket?**  
A: The configuration is removed from Luminary, but files remain on S3/MinIO. Content referencing this bucket may break.

**Q: Can I change a bucket's type after creation?**  
A: Yes, but make sure existing content is compatible with the new type.

**Q: Can I use the same S3 bucket in multiple configurations?**  
A: Yes, but this is usually not recommended. Each configuration should point to a unique bucket.

**Q: Do I need to use S3? Can I use other storage?**  
A: Any S3-compatible storage works: AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi, etc.

**Q: How do I know which bucket a piece of content is using?**  
A: Edit the content and look at the image/file information. The bucket name is shown.

**Q: Can I migrate content automatically between buckets?**  
A: Currently, you need to re-upload files manually. Automatic migration may be added in the future.

---

## Getting Help

If you need assistance:

1. Check the connection status in the Storage page
2. Test the bucket connection
3. Review the troubleshooting section above
4. Check your S3/MinIO provider's documentation
5. Contact your system administrator

---

_Last updated: October 2025_
