import { authority, InsecureProviderDomainError, issuer, jwksUri } from "./authority";

describe("authority", () => {
    it("defaults a bare domain to https", () => {
        expect(authority("tenant.eu.auth0.com")).toBe("https://tenant.eu.auth0.com");
    });

    it("keeps an explicit https scheme", () => {
        expect(authority("https://tenant.eu.auth0.com")).toBe("https://tenant.eu.auth0.com");
    });

    it("strips trailing slashes", () => {
        expect(authority("tenant.eu.auth0.com/")).toBe("https://tenant.eu.auth0.com");
        expect(authority("https://tenant.eu.auth0.com///")).toBe("https://tenant.eu.auth0.com");
    });

    it("preserves a path prefix", () => {
        expect(authority("https://example.com/oidc")).toBe("https://example.com/oidc");
    });

    describe("insecure domains", () => {
        it("rejects an http domain by default", () => {
            expect(() => authority("http://localhost:8099")).toThrow(InsecureProviderDomainError);
        });

        it("rejects an http domain that would otherwise reach link-local metadata", () => {
            expect(() => authority("http://169.254.169.254")).toThrow(InsecureProviderDomainError);
        });

        it("names the offending domain so the misconfiguration is findable", () => {
            expect(() => authority("http://localhost:8099")).toThrow(/http:\/\/localhost:8099/);
        });

        it("permits an http domain only when explicitly allowed", () => {
            expect(authority("http://localhost:8099", true)).toBe("http://localhost:8099");
        });

        it("does not treat a bare domain containing 'http' as scheme-carrying", () => {
            expect(authority("http-idp.example.com")).toBe("https://http-idp.example.com");
        });
    });
});

describe("jwksUri", () => {
    it("builds the JWKS endpoint for a bare domain", () => {
        expect(jwksUri("tenant.eu.auth0.com")).toBe(
            "https://tenant.eu.auth0.com/.well-known/jwks.json",
        );
    });

    it("does not double up on a trailing slash", () => {
        expect(jwksUri("tenant.eu.auth0.com/")).toBe(
            "https://tenant.eu.auth0.com/.well-known/jwks.json",
        );
    });

    it("refuses to build a plaintext JWKS endpoint by default", () => {
        expect(() => jwksUri("http://127.0.0.1:8099")).toThrow(InsecureProviderDomainError);
    });

    it("builds a plaintext JWKS endpoint when explicitly allowed", () => {
        expect(jwksUri("http://127.0.0.1:8099", true)).toBe(
            "http://127.0.0.1:8099/.well-known/jwks.json",
        );
    });
});

describe("issuer", () => {
    it("matches the Auth0 issuer form for a bare domain", () => {
        expect(issuer("tenant.eu.auth0.com")).toBe("https://tenant.eu.auth0.com/");
    });

    it("emits exactly one trailing slash for a domain that already had one", () => {
        expect(issuer("tenant.eu.auth0.com/")).toBe("https://tenant.eu.auth0.com/");
    });

    it("refuses an http issuer by default", () => {
        expect(() => issuer("http://localhost:8099")).toThrow(InsecureProviderDomainError);
    });

    it("keeps the scheme of a local issuer when explicitly allowed", () => {
        expect(issuer("http://localhost:8099", true)).toBe("http://localhost:8099/");
    });
});
