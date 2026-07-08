import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks } from '../db/schema';
import { VideoTranscodeService } from './video-transcode.service';

@Injectable()
export class VideoJobService implements OnModuleInit {
  private readonly logger = new Logger(VideoJobService.name);
  private readonly running = new Set<string>();

  constructor(private readonly videoTranscodeService: VideoTranscodeService) {}

  async onModuleInit() {
    const pendingBlocks = await db.query.contentBlocks.findMany({
      where: inArray(contentBlocks.processingStatus, ['pending', 'processing']),
    });
    for (const block of pendingBlocks) {
      this.enqueue(block.id);
    }
  }

  enqueue(blockId: string): void {
    if (this.running.has(blockId)) return;
    this.running.add(blockId);
    setImmediate(() => {
      void this.videoTranscodeService
        .process(blockId)
        .catch((error) => this.logger.error(`Video job failed: ${blockId}`, error?.stack ?? error))
        .finally(() => this.running.delete(blockId));
    });
  }
}
