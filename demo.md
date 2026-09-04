# Creating a Self-Contained WebContainer Demo with GitHub Actions

This guide provides a comprehensive walkthrough for creating a live, interactive demo of your Nuxt application that runs entirely in the browser using WebContainers. It also details how to automate the deployment of this demo to GitHub Pages using a `demo` branch and GitHub Actions.

## Part 1: Local Demo Setup

This section covers how to prepare your project to run the WebContainer demo on your local machine. We will use Vite to serve the demo launcher, as it simplifies development and automatically handles the required security headers (COOP/COEP).

### Step 1: Update PNPM Workspace

First, ensure your new `webcontainer_demo` package is recognized by pnpm's workspace. Update your `pnpm-workspace.yaml` file:

```yaml
# pnpm-workspace.yaml
packages:
  - '.'
  - 'webcontainer_demo'
```

### Step 2: Create the Demo Launcher Package

Create a directory for the demo and set it up as a separate package.

```bash
mkdir webcontainer_demo
cd webcontainer_demo
```

Now, create a `package.json` file for the launcher.

**`webcontainer_demo/package.json`:**
```json
{
  "name": "demo-launcher",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@webcontainer/api": "^1.1.9"
  },
  "devDependencies": {
    "vite": "^5.3.5"
  }
}
```

### Step 3: Create the Host HTML and Vite Config

Create the main `index.html` file and a `vite.config.js` to ensure the correct headers are set for the dev server and the final build.

**`webcontainer_demo/index.html`:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GCS-SSC Demo</title>
    <style>
        html, body, #container, iframe { margin: 0; padding: 0; border: 0; width: 100%; height: 100%; overflow: hidden; }
        #loading-screen { display: flex; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #f0f0f0; justify-content: center; align-items: center; font-family: sans-serif; font-size: 1.5rem; z-index: 10; transition: opacity 0.5s ease; }
    </style>
</head>
<body>
    <div id="loading-screen"><p>🚀 Booting WebContainer...</p></div>
    <div id="container"></div>
    <script type="module" src="/main.js"></script>
</body>
</html>
```

**`webcontainer_demo/vite.config.js`:**
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

### Step 4: Create the WebContainer Boot Script

This script contains the logic to boot the WebContainer, load your project files, and start the Nuxt server.

**`webcontainer_demo/main.js`:**
```javascript
import { WebContainer } from '@webcontainer/api';
import { projectFiles } from './project-files.js';

const containerEl = document.querySelector('#container');
const loadingScreen = document.querySelector('#loading-screen');
const loadingText = loadingScreen.querySelector('p');

let webcontainerInstance;

async function runCommand(command, args, logMessage) {
    console.log(logMessage);
    loadingText.textContent = logMessage;
    const process = await webcontainerInstance.spawn(command, args);
    // Stream output to console for debugging
    process.output.pipeTo(new WritableStream({
        write(data) {
            console.log(data);
        }
    }));
    const exitCode = await process.exit;
    if (exitCode !== 0) {
        throw new Error(`Command "${command} ${args.join(' ')}" failed with exit code ${exitCode}`);
    }
}

async function main() {
    loadingText.textContent = '🚀 Booting WebContainer...';
    webcontainerInstance = await WebContainer.boot();
    
    loadingText.textContent = 'Writing project files...';
    await webcontainerInstance.mount(projectFiles);

    await runCommand('pnpm', ['install'], '📦 Installing dependencies...');
    await runCommand('pnpm', ['run', 'dev'], '🔥 Starting Nuxt dev server...');

    webcontainerInstance.on('server-ready', (port, url) => {
        console.log(`Server ready at ${url}`);
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500); // Match CSS transition
        const iframe = document.createElement('iframe');
        iframe.src = url;
        containerEl.appendChild(iframe);
    });
}

main().catch(error => {
    console.error('An error occurred:', error);
    loadingText.textContent = `💥 Error: ${error.message}`;
});
```

### Step 5: Create the Project File Bundler Script

This Node.js script will collect all your project files and save them into a format the WebContainer can mount.

1.  **Add `glob` as a root dev dependency:**
    ```bash
    pnpm add -D glob
    ```

2.  **Create the script:**

**`scripts/bundle-for-webcontainer.mjs`:**
```javascript
import fs from 'fs/promises';
import { glob } from 'glob';

async function getProjectFiles() {
  const filePaths = await glob('**/*', {
    ignore: [
        '**/node_modules/**', '**/.git/**', '**/dist/**', '**/webcontainer_demo/**', 
        '**/.output/**', '**/.nuxt/**', '**/pnpm-lock.yaml'
    ],
    nodir: true,
    dot: true,
  });

  const files = {};
  for (const filePath of filePaths) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const pathParts = filePath.split('/');
        let currentLevel = files;
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentLevel[pathParts[i]] = currentLevel[pathParts[i]] || { directory: {} };
            currentLevel = currentLevel[pathParts[i]].directory;
        }
        currentLevel[pathParts[pathParts.length - 1]] = { file: { contents: content } };
    } catch (e) {
        console.warn(`Could not read file ${filePath}, skipping. Error: ${e.message}`);
    }
  }
  return files;
}

async function main() {
    console.log('Bundling project files for WebContainer...');
    const files = await getProjectFiles();
    const content = `export const projectFiles = ${JSON.stringify(files)};`; // Using a single line for performance
    await fs.writeFile('webcontainer_demo/project-files.js', content);
    console.log('✅ Project files bundled into webcontainer_demo/project-files.js');
}

main();
```

### Step 6: Local Testing Workflow

1.  **Install dependencies for both packages:**
    ```bash
    pnpm install
    ```
2.  **Bundle your project files:**
    ```bash
    node scripts/bundle-for-webcontainer.mjs
    ```
3.  **Run the demo launcher:**
    ```bash
    pnpm --filter demo-launcher dev
    ```
4.  Open the URL provided by Vite in your browser to see the demo.

## Part 2: Automating Deployment with GitHub Actions

This section explains how to automatically build and deploy your static demo to GitHub Pages whenever changes are pushed to the `demo` branch.

### Step 1: Configure GitHub Pages

1.  Go to your repository on GitHub.
2.  Click on **Settings** > **Pages**.
3.  Under "Build and deployment", set the **Source** to **GitHub Actions**.

### Step 2: Create the GitHub Actions Workflow

Create the following workflow file in your repository.

**`.github/workflows/deploy-demo.yml`:**
```yaml
name: Deploy WebContainer Demo

on:
  push:
    branches:
      - demo

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup PNPM
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install root dependencies
        run: pnpm install --frozen-lockfile

      - name: Bundle project files for WebContainer
        run: node scripts/bundle-for-webcontainer.mjs

      - name: Install demo-launcher dependencies
        run: pnpm --filter demo-launcher install --prod

      - name: Build the static demo launcher
        run: pnpm --filter demo-launcher run build

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./webcontainer_demo/dist

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### How It Works

1.  **Trigger**: The workflow runs automatically on every push to the `demo` branch.
2.  **Setup**: It checks out your code and sets up the Node.js and pnpm environment.
3.  **Bundle Files**: It runs your `bundle-for-webcontainer.mjs` script to generate the `project-files.js` needed by the launcher.
4.  **Build Launcher**: It installs dependencies for and builds the `demo-launcher` using Vite. This creates a highly optimized set of static files (`index.html`, JavaScript, CSS) in `webcontainer_demo/dist`.
5.  **Deploy**: It uploads the contents of `webcontainer_demo/dist` as a GitHub Pages artifact and deploys it to your site.

After the action completes successfully, your demo will be live at the URL provided in the "Pages" section of your repository settings.
