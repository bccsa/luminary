# Project automation

## Git hooks

Git hooks are scripts that run automatically when particular events occur in a Git repository. They let you customize Git's internal behavior at key points in the development lifecycle.

Common hook types: `pre-commit`, `post-commit`, `pre-checkout`, `post-checkout`, `pre-rebase`, `post-rewrite`.

For general background, see the [Git hooks documentation](https://git-scm.com/book/ms/v2/Customizing-Git-Git-Hooks).

### Recommended: post-checkout hook

After switching branches, rebuild `shared/` and reinstall it in `app/` and `cms/` when the shared package has changed. Install from the repo root:

```bash
cp scripts/post-checkout .git/hooks/post-checkout
chmod +x .git/hooks/post-checkout
```

### Custom hooks

To add your own hook:

1. Open `.git/hooks/` in your local clone.
2. Create a file named after the hook (e.g. `pre-commit`).
3. Add your bash script and make it executable (`chmod +x`).

## Luminary automation CLI

Local setup and service management are handled by [`scripts/automate-luminary.sh`](../../scripts/automate-luminary.sh). From the repo root:

```bash
./scripts/automate-luminary.sh setup
```

Full command reference, Auth0 setup, and troubleshooting: **[scripts/README.md](../../scripts/README.md)**.
