import type { ApiCourse } from '../../api/courses';
import type { ApiContentBlock } from '../../api/contentBlocks';
import type { ApiPracticeBlock } from '../../api/practiceBlocks';
import type { ContentBlock, Course, PracticeBlock } from '../courseTypes';

export function toFrontendCourse(apiCourse: ApiCourse): Course {
  return {
    id: apiCourse.id,
    title: apiCourse.title,
    modules: [],
    launches: [],
    groups: [],
  };
}

export function toFrontendBlock(b: ApiContentBlock): ContentBlock {
  return {
    id: b.id,
    type: b.type,
    html: b.html ?? undefined,
    fileName: b.fileName ?? undefined,
    previewUrl: b.previewUrl ?? undefined,
    embedUrl: b.embedUrl ?? undefined,
    label: b.label ?? undefined,
    processingStatus: b.processingStatus,
    sourceKey: b.sourceKey ?? undefined,
    hlsMasterKey: b.hlsMasterKey ?? undefined,
    hlsBaseKey: b.hlsBaseKey ?? undefined,
    aesKeyRef: b.aesKeyRef ?? undefined,
    durationSec: b.durationSec ?? undefined,
    errorMessage: b.errorMessage ?? undefined,
    processedAt: b.processedAt ?? undefined,
    classSessionId: b.classSessionId ?? undefined,
    buttonUrl: b.buttonUrl ?? undefined,
    buttonColor: b.buttonColor ?? undefined,
    buttonTextColor: b.buttonTextColor ?? undefined,
    openInNewTab: b.openInNewTab,
    messageLines: b.messageLines,
  };
}

export function toFrontendPracticeBlock(b: ApiPracticeBlock): PracticeBlock {
  return {
    id: b.id,
    type: b.type,
    testId: b.testId,
    description: b.description,
    maxScore: b.maxScore,
  };
}

export function isPersistedVideoBlock(
  block: ContentBlock | undefined,
): boolean {
  return (
    block?.type === 'video' &&
    block.processingStatus !== 'uploading' &&
    Boolean(block.sourceKey)
  );
}

export function isPersistedFileBlock(
  block: ContentBlock | undefined,
): boolean {
  return (
    block?.type === 'file' &&
    block.processingStatus !== 'uploading' &&
    Boolean(block.previewUrl)
  );
}

export function isAlwaysPersistedBlock(
  block: ContentBlock | undefined,
): boolean {
  return (
    block?.type === 'editor' ||
    block?.type === 'live_class' ||
    block?.type === 'image' ||
    block?.type === 'button' ||
    block?.type === 'message'
  );
}
