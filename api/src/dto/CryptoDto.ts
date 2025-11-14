import { IsNotEmpty } from "class-validator";
import { Expose } from "class-transformer";
import { _baseDto } from "./_baseDto";

/**
 * Encrypted storage wrapper. Consumers should decrypt using the
 * appropriate secure key before use.
 */
export class CryptoDto extends _baseDto {
    @IsNotEmpty()
    @Expose()
    data: any;
}
