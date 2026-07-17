import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private publicDomain: string;

  constructor(private configService: ConfigService) {
    const endpoint = this.normalizeEndpoint(this.configService.get<string>('OBJECT_STORAGE_ENDPOINT') || '');
    this.bucketName = this.configService.get<string>('OBJECT_STORAGE_BUCKET_NAME') || '';
    this.publicDomain = (this.configService.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL') || '').replace(/\/+$/, '');

    this.s3Client = new S3Client({
      region: this.configService.get<string>('OBJECT_STORAGE_REGION') || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: false,
      credentials: {
        accessKeyId: this.configService.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY') || '',
      },
    });
  }

  private normalizeEndpoint(value: string): string {
    const raw = value.trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
    return `https://${raw.replace(/\/+$/, '')}`;
  }

  private assertConfigured(): void {
    const required = {
      OBJECT_STORAGE_BUCKET_NAME: this.bucketName,
      OBJECT_STORAGE_ACCESS_KEY_ID: this.configService.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID'),
      OBJECT_STORAGE_SECRET_ACCESS_KEY: this.configService.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      console.error(`Object storage configuration missing: ${missing.join(', ')}`);
      throw new InternalServerErrorException(
        "Fayl ombori sozlanmagan. Server administratori bilan bog'laning.",
      );
    }
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    this.assertConfigured();
    const ext = file.originalname.split('.').pop();
    const key = `${folder}/${crypto.randomUUID()}.${ext}`;
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return this.publicDomain ? `${this.publicDomain}/${key}` : key;
    } catch (error) {
      console.error('Object storage upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }

  // Client to'g'ridan-to'g'ri shu key'ga PUT qila oladigan, muddati qisqa,
  // content-type va hajmga qulflangan yuklash havolasi. Backend orqali
  // proxy qilishning o'rniga ishlatiladi — katta fayllarda (video) ancha tez.
  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSec = 900,
  ): Promise<string> {
    this.assertConfigured();
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSec });
  }

  async headObject(key: string): Promise<{ sizeBytes: number; contentType: string | undefined } | null> {
    this.assertConfigured();
    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: this.getKeyFromUrlOrKey(key) }),
      );
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  getKeyFromUrlOrKey(value: string): string {
    const clean = value.trim();
    if (!clean) return '';
    if (this.publicDomain && clean.startsWith(this.publicDomain)) {
      return clean.slice(this.publicDomain.length + 1);
    }
    return clean.replace(/^\/+/, '');
  }

  getPublicUrl(key: string): string {
    const cleanKey = this.getKeyFromUrlOrKey(key);
    return this.publicDomain ? `${this.publicDomain}/${cleanKey}` : cleanKey;
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    cacheControl = 'private, max-age=0, no-store',
  ): Promise<string> {
    this.assertConfigured();
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
      return key;
    } catch (error) {
      console.error('Object storage buffer upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }

  async uploadStream(
    key: string,
    stream: Readable,
    contentType: string,
    cacheControl = 'private, max-age=0, no-store',
  ): Promise<string> {
    this.assertConfigured();
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: stream,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
      return key;
    } catch (error) {
      console.error('Object storage stream upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    this.assertConfigured();
    const result = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: this.getKeyFromUrlOrKey(key) }),
    );
    return result.Body as Readable;
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const stream = await this.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getObjectText(key: string): Promise<string> {
    return (await this.getObjectBuffer(key)).toString('utf8');
  }

  async deletePrefix(prefix: string): Promise<void> {
    this.assertConfigured();
    const cleanPrefix = this.getKeyFromUrlOrKey(prefix);
    if (!cleanPrefix) return;
    let continuationToken: string | undefined;
    do {
      const listed = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: cleanPrefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of listed.Contents ?? []) {
        if (object.Key) {
          await this.deleteFile(object.Key);
        }
      }
      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
  }

  async deleteFile(key: string): Promise<boolean> {
    this.assertConfigured();
    const cleanKey = this.getKeyFromUrlOrKey(key);
    if (!cleanKey) return false;
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: cleanKey }));
      return true;
    } catch (error) {
      console.error('Object storage delete error:', error);
      return false;
    }
  }
}
