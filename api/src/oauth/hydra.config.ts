/**
 * Hydra's admin API is never reachable from a browser, so accepting a login,
 * consent or logout request is server work. These values switch that endpoint
 * on; with `adminUrl` unset the controller refuses every request, so an
 * environment that does not run Hydra cannot be talked into acting as its
 * consent authority.
 */
export type HydraConfig = {
    adminUrl?: string;
    /**
     * The one client whose consent is granted without asking. OAuth2 is a
     * delegation protocol: skipping the screen is only defensible when the
     * client and the identity provider are the same product.
     */
    trustedClientId?: string;
};

export function hydraConfig(): HydraConfig {
    return {
        adminUrl: process.env.HYDRA_ADMIN_URL?.replace(/\/+$/, ""),
        trustedClientId: process.env.HYDRA_TRUSTED_CLIENT_ID,
    };
}
