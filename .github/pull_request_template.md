## Quality checklist

- [ ] I ran `bun run quality:pr`.
- [ ] I ran `bun run lint`.
- [ ] I ran `bun run typecheck`.
- [ ] I ran relevant unit tests.
- [ ] I added/updated tests for new behaviour.
- [ ] I checked authorization for new/changed `server/api/**` routes.
- [ ] I checked i18n/bilingual requirements for user-facing text and DB name/description fields.
- [ ] I checked soft deletion rules for delete-like behaviour.
- [ ] I reviewed generated reports under `.agent/reports/pr/`.
