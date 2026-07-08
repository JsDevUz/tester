import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
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

  async deleteFile(key: string): Promise<boolean> {
    const cleanKey =
      this.publicDomain && key.startsWith(this.publicDomain) ? key.slice(this.publicDomain.length + 1) : key;
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
