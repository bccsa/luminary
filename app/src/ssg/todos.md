~~1. Render homepage in seperate languages for locales~~

2. Look at using wrangler/script to evict updated documents from cache:
    - May be seperate project for specific cloudflare implementation
    - SSG must be able call the cloudflare script
    - Could also be direct cloudflare communication

    For Cloudflare: app repo now makes dist-web correct. Deploy repo should do the remote half: upload changed files, delete R2 objects missing locally, and purge changed/deleted URLs from Cloudflare cache.

3. Look at first load empty load state for split second
