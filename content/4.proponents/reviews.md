---
title: Reviews
description: Runtime assessment set behavior for proponents.
---

# Proponent Reviews

Runtime proponent reviews are stored in `Common_Review_Set` and `Common_Review`.

## Setup vs Runtime

- `Common_Review_Set_Setup` defines the reusable review-set configuration.
- `Common_Review_Setup` defines the assessment-schema members inside that configuration.
- `Common_Review_Set` is the runtime set created for one concrete proponent.
- `Common_Review` stores each runtime assessment inside that set.

## Creation Rules

- Review setups have no `on completion` flag. A proponent Review Set starts only through the authorized direct-Review action or as an ordered Workflow member.
- Direct runtime proponent Review Sets are created from an applicable published applicant-recipient Review Set Setup.
- The selected setup must contain at least one assessment member.
- Non-sequential setups generate all configured assessment members immediately.
- Sequential setups generate only the first configured assessment member initially.

## In-Progress Rule

- Only one non-terminal runtime review set may exist at a time for the same `(review set setup, entity type, entity id)` combination.
- A new runtime review set may be created after the previous set reaches a terminal status.

## Terminal Runtime States

- `succeeded`
- `approved`
- `denied`
- `cancelled`

## Retry Rule

- A denied or cancelled runtime review may be retried by cloning that review into a new draft review row in the same runtime set.
- This avoids recreating the entire runtime set when only one review needs to be retried.

## Sequential Progression

- Sequential progression is not triggered from the current admin status patch route.
- When completion and approval routes are implemented, they should call the shared progression utility after a review reaches a successful terminal status.
- A sequential set should generate the next configured review only after the current review reaches `succeeded` or `approved`.
- `denied` and `cancelled` do not advance the sequence on their own.
- If a denied or cancelled review is retried and that retry later reaches `succeeded` or `approved`, the next configured review should then be generated.

## Cancellation

- A runtime review set may be cancelled while it is not terminal.
- Terminal sets cannot be cancelled again.
