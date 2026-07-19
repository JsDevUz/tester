import { StorageService } from './storage.service';

describe('StorageService URL normalization', () => {
  const service = new StorageService({
    get: (key: string) => ({
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://cdn.example.com/',
      OBJECT_STORAGE_BUCKET_NAME: 'media-bucket',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'test-key',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret',
    })[key],
  } as any);

  it('object keyni public URLga aylantiradi', () => {
    expect(service.getPublicUrl('classroom-recordings/session.ogg'))
      .toBe('https://cdn.example.com/classroom-recordings/session.ogg');
  });

  it('LiveKit qaytargan s3 URLdan bucket qismini olib tashlaydi', () => {
    expect(service.getPublicUrl('s3://media-bucket/classroom-recordings/session.ogg'))
      .toBe('https://cdn.example.com/classroom-recordings/session.ogg');
  });

  it('allaqachon public bo‘lgan URLni o‘zgartirmaydi', () => {
    expect(service.getPublicUrl('https://other-cdn.example.com/session.ogg'))
      .toBe('https://other-cdn.example.com/session.ogg');
  });
});
