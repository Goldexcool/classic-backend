import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTicketCheckoutDto {
  @IsUUID()
  requestKey!: string;

  @IsUUID()
  ticketTypeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  buyerName!: string;

  @IsEmail()
  @MaxLength(254)
  buyerEmail!: string;
}
