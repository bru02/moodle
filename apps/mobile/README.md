# Based Moodle Mobile

Repo-specific mobile setup notes.

## Start the iOS compare target

From the repo root:

```bash
bash ./scripts/compare/start-mobile-ios.sh
```

What this does:

- starts Expo Metro in dev-client mode with `--host localhost`
- waits for Metro to start listening
- starts a `127.0.0.1:8081 -> [::1]:8081` bridge when Metro comes up IPv6-only
- warms the exact iOS bundle URL the Expo dev client requests
- opens the Expo dev-client deep link in the booted simulator

This is necessary because the iOS simulator path is flaky if Metro is only reachable on `::1` while the dev client asks for `127.0.0.1`.

## Open the app in the simulator

After the setup script reports success, the booted simulator should be sent to the Expo dev-client URL automatically.

If it does not foreground automatically:

```bash
npx agent-device --session moodle-ios --session-lock strip open me.toldy.moodle --platform ios
```

Inside the Expo dev client, open the recent server entry for:

```text
Based Moodle, http://[::1]:8081
```

## Start the official Moodle app in a browser

From the repo root:

```bash
bash ./scripts/compare/start-oma-web.sh
```

That script waits for the official app at:

```text
https://[::1]:8100
```

Use `agent-browser` against that URL, not `https://localhost:8100`, because the local dev server is bound on IPv6 loopback in this environment.

## Compare workflow

1. Start OMA web with `bash ./scripts/compare/start-oma-web.sh`.
2. Start the local iOS target with `bash ./scripts/compare/start-mobile-ios.sh`.
3. Open OMA in `agent-browser` at `https://[::1]:8100`.
4. Open `me.toldy.moodle` in the simulator with `agent-device`.
5. Compare the same flows against the same Moodle site and account.
