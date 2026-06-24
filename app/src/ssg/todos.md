1. Render homepage in seperate languages for locales

2. Look at using wrangler/script to evict updated documents from cache:
    - May be seperate project for specific cloudflare implementation
    - SSG must be able call the cloudflare script
    - Could also be direct cloudflare communication

3. Look at first load empty load state for split second
