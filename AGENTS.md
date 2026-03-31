This codebase will outlive you. Every shortcut becomes someone else's burden. Patterns you establish will be copied. Corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

This means if your work surfaces a "preexisting" or "unrelated" problem during validation, fix it by default instead of just reporting it.

Examples: type errors, lint failures, failing tests, broken imports, and obvious regressions in nearby code.

Do not use "unrelated" as a reason to leave the codebase broken when the fix is clear and low-risk. Only stop and ask if the unrelated issue is large, ambiguous, destructive, or would pull the task into a materially different piece of work.

## Mobile dev/test setup notes

- The iOS app under `apps/mobile` is an Expo dev client, not a standalone simulator build. If the app opens to "No development servers found", start Metro from the repo root with `bun run --cwd apps/mobile start -- --dev-client`.
- On restricted or enterprise Wi-Fi, LAN mode may fail even when the app is installed correctly. Use `bun run --cwd apps/mobile start -- --dev-client --host tunnel` so the dev client connects through Expo tunnel instead of the local network.
- `--host localhost` only helps the iOS simulator running on the same Mac. It will not help a physical device connect to Metro.
- `agent-device` is available via `npx agent-device` here because there is no global `agent-device` binary on the machine.
- The first `agent-device` iOS command can take about a minute because it builds and boots the XCTest runner in `~/.agent-device/ios-runner/derived`.
- Do not run multiple `agent-device` iOS commands in parallel during runner startup. Xcode locks `~/.agent-device/ios-runner/derived/Build/Intermediates.noindex/XCBuildData/build.db`, which causes `xcodebuild build-for-testing failed`.
- For stable iOS automation, open one named session first, then reuse it: `npx agent-device --session moodle-ios --session-lock strip open me.toldy.moodle --platform ios`.
- After the session exists, run follow-up commands serially, for example `npx agent-device --session moodle-ios snapshot -i`. The first successful snapshot may take 45-65 seconds while the runner finishes connecting.
