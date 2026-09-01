/**
 * A provider's JWKS is fetched from its domain, so anything that weakens the
 * transport there lets an on-path attacker serve their own signing keys and mint
 * tokens the API accepts. https is therefore required unless explicitly relaxed.
 */
export class InsecureProviderDomainError extends Error {
    constructor(domain: string) {
        super(
            `AuthProvider domain "${domain}" is not https. Set ` +
                "AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true to permit it (local test issuers only).",
        );
        this.name = "InsecureProviderDomainError";
    }
}

/**
 * Normalises an AuthProvider `domain` into an OIDC authority URL. The clients
 * apply the same rule, so a domain that already carries a scheme resolves to the
 * same authority on both sides of the wire.
 */
export function authority(domain: string, allowInsecure = false): string {
    const hasScheme = /^https?:\/\//.test(domain);
    if (hasScheme && domain.startsWith("http://") && !allowInsecure) {
        throw new InsecureProviderDomainError(domain);
    }
    const withScheme = hasScheme ? domain : `https://${domain}`;
    // A trailing slash survives into `${authority}/.well-known/jwks.json`,
    // which some providers 404 on.
    return withScheme.replace(/\/+$/, "");
}

/** JWKS endpoint for a provider domain. */
export function jwksUri(domain: string, allowInsecure = false): string {
    return `${authority(domain, allowInsecure)}/.well-known/jwks.json`;
}

/**
 * Expected `iss` claim for a provider domain. The trailing slash is part of the
 * issuer identifier that Auth0 and most OIDC servers emit.
 */
export function issuer(domain: string, allowInsecure = false): string {
    return `${authority(domain, allowInsecure)}/`;
}
