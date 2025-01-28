import { HttpException, HttpStatus } from "@nestjs/common";
import * as JWT from "jsonwebtoken";
import { Logger } from "winston";

export const validateJWT = (token: string, jwtSecret: string, logger: Logger) => {
    let jwt: string | JWT.JwtPayload;
    if (token) {
        try {
            jwt = JWT.verify(token, jwtSecret);
        } catch (err) {
            logger.error(`Error verifying JWT`, err);
        }

        if (!jwt) {
            throw new HttpException("Invalid auth token, please re-login", HttpStatus.BAD_REQUEST);
        }
    }
    return jwt;
};
