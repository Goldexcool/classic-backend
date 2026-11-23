import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CreateTicketTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity!: number;
}

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  venue?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  galleryUrls?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  eventProgram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  additionalInfo?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTicketTypeDto)
  ticketTypes!: CreateTicketTypeDto[];
}
