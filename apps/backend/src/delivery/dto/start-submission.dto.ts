import { IsString, IsNotEmpty, Length } from 'class-validator';

export class StartSubmissionDto {
  @IsString() @IsNotEmpty() @Length(8, 8) slug: string;
  @IsString() @IsNotEmpty() studentName: string;
}
