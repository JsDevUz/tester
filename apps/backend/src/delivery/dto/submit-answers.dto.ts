import { IsArray, IsUUID, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerItemDto {
  @IsUUID() questionId: string;
  @IsArray() @IsUUID('4', { each: true }) selectedOptionIds: string[];
  @IsOptional() @IsString() textAnswer: string | null;
}

export class SubmitAnswersDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}
