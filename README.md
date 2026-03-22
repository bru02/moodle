# Moodle

Monorepo for the Moodle clients.

- `apps/raycast`: the current Raycast extension
- `packages/core`: shared Moodle business logic for Raycast and a future Expo app
- `apps/expo`: intended location for the Expo app

This follows Expo's workspace-based monorepo layout so the Expo app can be added under `apps/` without another repo-wide move later.
