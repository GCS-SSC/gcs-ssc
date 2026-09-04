# Local document generation tools

Document generation can run on Linux or WSL without installing LibreOffice or Chrome globally.

Run the local installer:

```bash
bun run bun:docgen:install
```

The installer downloads and extracts:

- LibreOffice Linux x64 `.deb` packages into `.tools/docgen/libreoffice`
- Puppeteer's browser into `.tools/docgen/puppeteer`

It then creates or updates the regular Nuxt `.env` file with `LIBREOFFICE_SOFFICE_PATH` and `PUPPETEER_CACHE_DIR`. Nuxt loads `.env` automatically during `dev`, `build`, and `preview`, so start the app normally:

```bash
bun run dev
```

Both `.tools/` and `.env` are ignored by git.

Use `DOCGEN_ENV_FILE` to target a different regular env file for another environment:

```bash
DOCGEN_ENV_FILE=.env.production bun run bun:docgen:install
DOCGEN_ENV_FILE=.env.development bun run bun:docgen:install
```

The installer preserves existing file contents and only upserts the two docgen keys.

Advanced overrides:

```bash
LIBREOFFICE_VERSION=26.2.3 bun run bun:docgen:install
LIBREOFFICE_DOWNLOAD_URL=https://example.invalid/LibreOffice_Custom_Linux_x86-64_deb.tar.gz bun run bun:docgen:install
PUPPETEER_BROWSER=chrome-headless-shell@stable bun run bun:docgen:install
```

This still relies on normal Linux runtime libraries being present in WSL/Linux, but it avoids a system-wide LibreOffice or Chrome install.
