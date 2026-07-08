import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks } from '../db/schema';

@Injectable()
export class VideoTranscodeService {
  async process(blockId: string): Promise<void> {
    await db
      .update(contentBlocks)
      .set({ processingStatus: 'failed', errorMessage: 'Video processing engine is not enabled yet' })
      .where(eq(contentBlocks.id, blockId));
  }
}
