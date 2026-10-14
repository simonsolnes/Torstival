# Torstival

A single-screen Expo / React Native interval flasher for Android and iOS.
Set an interval in seconds, then press **Start**. The whole screen flashes white
for 120 ms after every interval. **Stop** cancels the timer and clears the flash.
Intervals accept decimals (including decimal commas), from 1 to 3600 seconds.
The screen stays awake while running. Leaving the app stops it; returning never
restarts it automatically. Change the interval while stopped.

## Repository commands

**Every maintained operation is a justfile target.** Run `just` to list them.
There are no npm scripts or cloud build services. Release builds bundle the
JavaScript locally and work offline without Expo Go, Metro, or an Expo account.
The first build downloads dependencies and native toolchains from their vendors.

Prerequisites: Node.js 22.13+ (24 LTS recommended), npm, just, JDK 21, and Android
SDK command-line tools. iOS builds also require macOS, Xcode and CocoaPods.
The justfile defaults to Homebrew's Apple Silicon JDK 21 and
`~/Library/Android/sdk`. Set `JAVA_HOME` and `ANDROID_HOME` for other locations.

| Command | Purpose |
| --- | --- |
| `just setup` | Install dependencies from the committed lockfile |
| `just check` | Typecheck and run deterministic timer tests |
| `just doctor` | Check Expo dependency compatibility |
| `just build` | Check and build Android plus iOS simulator |
| `just build-android` | Generate native project, sign and build `dist/torstival.apk` |
| `just verify-apk` | Verify the APK signature and bundled JavaScript |
| `just artifact-info` | Show APK version, device support, size and checksum |
| `just install-android` | Install the APK on an attached Android device |
| `just build-ios` | Build `dist/Torstival.app` for the iOS simulator |
| `just verify-ios` | Verify the simulator app contains its JavaScript bundle |
| `just run-ios` | Install and open the app in a booted simulator |
| `just smoke-ios UUID` | Cold-launch, check the app stays alive, and capture its screen |
| `just screenshot-ios` | Save a simulator screenshot in `dist/` |
| `just devices` | List connected Android devices and local iOS simulators |
| `just boot-ios UUID` | Boot a specific iOS simulator |
| `just shutdown-ios UUID` | Shut down that simulator |
| `just recover-ios-simulator` | Restart a stuck local simulator service (interrupts simulators) |
| `just logs` | Inspect saved native build logs |
| `just logs-ios UUID` | Inspect app runtime logs in a specific simulator |
| `just build-ios-device` | Compile an unsigned release build for physical iOS hardware |
| `just prebuild` | Regenerate both native projects from app config/plugins |
| `just pods` | Generate iOS project and install CocoaPods dependencies |
| `just prepare-ios` | Apply the Expo intermediate-framework signing workaround |
| `just deps-lock` | Resolve dependencies after editing package.json |
| `just deps-align` | Align dependency versions to the installed Expo SDK |
| `just audit` | Inspect dependency security advisories |
| `just clean` | Remove generated output while preserving signing keys |
| `just commit 'message'` | Commit a completed work chunk |
| `just status` | Review working tree and recent commits |

## Sharing the Android app

Send **`dist/torstival.apk`** after `just build-android`. The recipient opens it
on Android and permits installation from their file or messaging app if asked.
It is a signed release APK containing both ARM and emulator architectures.

The first Android build creates a random password and private signing key in
**`.local/`**, which is ignored by Git. Back up that directory securely: future
updates must use the same key to install over this app. The build never falls
back to a public debug key. Increment `android.versionCode` in `app.json` when
shipping an update. `just clean` preserves the signing credentials.

## iOS

`just build-ios` produces a release simulator app, which needs no Apple account.
`just build-ios-device` compiles for real hardware but does not sign or distribute
an IPA. Installing on someone else's iPhone requires Apple signing and a chosen
distribution method; those credentials are not configured here.
When multiple simulators are booted, pass a UUID to `just run-ios UUID` and
`just screenshot-ios UUID`.

The app enables `expo-build-properties`' `ios.enableSceneSupport` for Xcode 27
and iOS 27. Without this opt-in, SDK 57's default app lifecycle compiles but
crashes at launch on iOS 27. `just verify-ios` checks the built scene manifest.
See [Expo's scene migration guidance](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

## Maintaining native configuration

`android/` and `ios/` are generated and ignored. Put native configuration in
`app.json` or an Expo config plugin under `plugins/`; do not hand-edit the generated
projects. Android release signing is applied by `with-local-signing.cjs`.
The supported local build approach follows
[Expo's local release documentation](https://docs.expo.dev/guides/local-app-production/).

`just pods` automatically applies `scripts/prepare-ios.cjs`. ExpoModulesJSI's
nested build does not inherit the unsigned parent build setting, so this small,
idempotent patch disables signing of that intermediate framework. This avoids
code-sign failures from macOS File Provider metadata in a synced Documents
directory. It does not change app signing. Review/remove the patch when upgrading
ExpoModulesJSI; it fails explicitly if the expected upstream script changes.
