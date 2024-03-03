# Setup Vue app

This setup is almost entirely the same for both the app and the CMS.

### Editor

The recommended editor is [Visual Studio Code](https://code.visualstudio.com/), with the following extensions (which VS Code should automatically prompt you to install when first opening the repository):

- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [TailwindCSS Intellisense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

Configure Prettier as the default formatter, and configure VS Code to automatically format on save. One way to do this is by adding this to your local `settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

### Running the project

1. Copy the environment variable file and fill in required fields, such as the client id for authentication:

```sh
cp .env.example .env
```

2. Install dependencies:

```sh
npm ci
```

3. Then start a live-reloading server with:

```sh
npm run dev
```

### Building for production

```sh
npm run build
```

### Tests

#### Unit tests

```sh
npm run test:unit
```

#### End-to-end tests

The end-to-end tests are run with [Playwright](https://playwright.dev).

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
npm run build

# Runs the end-to-end tests
npm run test:e2e
# Runs the tests only on Chromium
npm run test:e2e -- --project=chromium
# Runs the tests of a specific file
npm run test:e2e -- tests/example.spec.ts
# Runs the tests in debug mode
npm run test:e2e -- --debug
```

### Linting

The code is linted for code quality and style issues with [ESLint](https://eslint.org/). You should configure your editor to automatically lint files on save, but you can also manually run this command to check for errors:

```sh
npm run lint
```

Automatically fix issues by running

```sh
npm run lint:fix
```

#### Prettier

We use [Prettier](https://prettier.io) to format our code in a common way. Configure your editor to automatically format files on save with Prettier. Any issues from Prettier will be treated as errors in CI to ensure that the code is always styled in the correct way.
