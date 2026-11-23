import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DatabaseService } from '../database/database.service';

const imageTypes = {
  'image/jpeg': { extension: 'jpg', matches: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/png': { extension: 'png', matches: (data: Buffer) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', matches: (data: Buffer) => data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
} as const;

export type UploadedImage = { buffer: Buffer; mimetype: string };

@Injectable()
export class UploadsService {
  private s3?: S3Client;

  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  async uploadImage(tenantSlug: string, userId: string, file: UploadedImage) {
    const membership = await this.db.query(
      `SELECT 1 FROM tenants t JOIN tenant_memberships m ON m.tenant_id = t.id
       WHERE t.slug = $1 AND m.user_id = $2`,
      [tenantSlug, userId],
    );
    if (!membership.rowCount) throw new ForbiddenException('You do not have access to this project.');

    const imageType = imageTypes[file.mimetype as keyof typeof imageTypes];
    if (!imageType || !imageType.matches(file.buffer)) throw new BadRequestException('The uploaded file is not a valid JPG, PNG, or WebP image.');

    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('R2_BUCKET');
    const publicUrl = this.config.get<string>('R2_PUBLIC_URL')?.replace(/\/+$/, '');
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      throw new ServiceUnavailableException('Image uploads are not configured yet. You can paste a public image URL instead.');
    }

    this.s3 ??= new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    const key = `events/${tenantSlug}/${randomUUID()}.${imageType.extension}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return { url: `${publicUrl}/${key}` };
  }
}
