import { ArrayMinSize, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateClassSessionDto {
  @IsString()
  courseId!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class CreateFreeClassSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class CreateBoardDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class UpdateBoardTitleDto {
  @IsString()
  title!: string;
}

export class ReopenFreeSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class OverrideAttendanceDto {
  @IsIn(['absent', 'present', 'late'])
  status!: 'absent' | 'present' | 'late';
}

export class AttachPdfDto {
  @IsString()
  mediaAssetId!: string;

  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayMinSize(1)
  pageNumbers!: number[];
}

export class InsertPdfPagesDto {
  @IsString()
  mediaAssetId!: string;

  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayMinSize(1)
  pageNumbers!: number[];

  @IsInt()
  @Min(0)
  afterPageIndex!: number;
}

export class StartRecordingDto {
  @IsIn(['full', 'boardAudio', 'boardSilent'])
  mode!: 'full' | 'boardAudio' | 'boardSilent';
}

export class GuestVoiceTokenDto {
  @IsString()
  guestName!: string;

  @IsUUID()
  @IsOptional()
  guestId?: string;
}
