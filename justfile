set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

export EXPO_NO_TELEMETRY := "1"
export CI := "1"
export JAVA_HOME := env_var_or_default("JAVA_HOME", if os() == "macos" { "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" } else { "/usr/lib/jvm/java-21-openjdk-amd64" })
export TORSTIVAL_TEST_JAVA_HOME := env_var_or_default("TORSTIVAL_TEST_JAVA_HOME", if os() == "macos" { "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" } else { "/usr/lib/jvm/java-21-openjdk-amd64" })
export ANDROID_HOME := env_var_or_default("ANDROID_HOME", env_var("HOME") / "Library/Android/sdk")
export PATH := JAVA_HOME / "bin:" + env_var("PATH")

# Show every supported repository operation.
default:
    @just --list

# Install the exact locked dependencies on a fresh checkout.
setup:
    npm ci

# Resolve dependencies after intentionally editing package.json.
deps-lock:
    npm install

# Add an Expo-compatible dependency and update the lockfile.
deps-add package:
    npx --no-install expo install {{quote(package)}}

# Legg til et lokalt utviklingsverktøy.
deps-add-dev package:
    npm install --save-dev {{quote(package)}}

# Lag appikonene fra fotballtegningen.
generate-icons:
    node scripts/generate-icons.cjs

# Regenerate the short bundled iOS beep from its deterministic waveform.
generate-beep:
    node scripts/generate-beep.cjs

# Validate TypeScript and the interval timer behavior.
check: typecheck test
    git diff --check

typecheck:
    npx --no-install tsc --noEmit

test:
    node --experimental-strip-types --test src/*.test.ts

# Test the real Android service lifecycle on simulated Android 9 and 16 runtimes.
test-android-native: prebuild-android
    #!/usr/bin/env bash
    set -euo pipefail
    export JAVA_HOME="$TORSTIVAL_TEST_JAVA_HOME"
    export PATH="$JAVA_HOME/bin:$PATH"
    cd android
    ./gradlew --no-daemon :torstival-pulse:testReleaseUnitTest > ../.local-android-tests.log 2>&1 || { tail -120 ../.local-android-tests.log; exit 1; }

# Inspect running foreground service, wake lock and notification on a connected Android phone.
inspect-android:
    "$ANDROID_HOME/platform-tools/adb" shell dumpsys activity services no.solnes.torstival
    "$ANDROID_HOME/platform-tools/adb" shell dumpsys power | rg -i 'Torstival|Wake Locks' || true

# Read runtime errors from a connected Android phone.
logs-android:
    "$ANDROID_HOME/platform-tools/adb" logcat -d -s AndroidRuntime TorstivalPulse

# Check that package versions match the installed Expo SDK.
doctor:
    npx --no-install expo install --check

# Update Expo-managed packages to compatible versions, then review the lockfile.
deps-align:
    npx --no-install expo install --fix

# Inspect dependency advisories without applying breaking upgrades.
audit:
    npm audit

# Generate both native projects. Never edit generated ios/ or android/ files.
prebuild:
    npx --no-install expo prebuild --no-install

prebuild-android:
    npx --no-install expo prebuild --platform android --no-install

prebuild-ios:
    npx --no-install expo prebuild --platform ios --no-install

# Create a persistent, private local signing key. Back up .local/ securely.
android-key:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p .local
    chmod 700 .local
    if [ ! -f .local/android-release.keystore ]; then
      umask 077
      if [ ! -f .local/android-key-password ]; then
        openssl rand -hex 32 > .local/android-key-password
      fi
      export TORSTIVAL_KEYSTORE_PASSWORD="$(cat .local/android-key-password)"
      keytool -genkeypair -keystore .local/android-release.keystore -storepass:env TORSTIVAL_KEYSTORE_PASSWORD -keypass:env TORSTIVAL_KEYSTORE_PASSWORD -alias torstival -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Torstival, O=Torstival, C=NO'
    fi

# Build a standalone, signed universal APK for sharing with Android users.
build-android: android-key prebuild-android compile-android

# Recompile an already-generated Android project after source-only edits.
compile-android: android-key
    #!/usr/bin/env bash
    set -euo pipefail
    export TORSTIVAL_KEYSTORE_PASSWORD="$(cat .local/android-key-password)"
    cd android
    ./gradlew --no-daemon :app:assembleRelease > ../.local-android-build.log 2>&1 || { tail -100 ../.local-android-build.log; exit 1; }
    cd ..
    mkdir -p dist
    cp android/app/build/outputs/apk/release/app-release.apk dist/torstival.apk
    just verify-apk

# Verify release signing, embedded JavaScript, and the background service in the APK.
verify-apk:
    #!/usr/bin/env bash
    set -euo pipefail
    apksigner="$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort | tail -1)"
    "$apksigner" verify --verbose dist/torstival.apk
    unzip -l dist/torstival.apk | rg 'assets/index.android.bundle'
    aapt="$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort | tail -1)"
    manifest="$("$aapt" dump xmltree dist/torstival.apk AndroidManifest.xml)"
    rg -Fq '"no.solnes.pulse.PulseService"' <<< "$manifest"
    for permission in CAMERA VIBRATE WAKE_LOCK FOREGROUND_SERVICE FOREGROUND_SERVICE_SPECIAL_USE FOREGROUND_SERVICE_CAMERA; do
      rg -Fq "\"android.permission.$permission\"" <<< "$manifest"
    done

# Install on an attached Android phone (USB debugging enabled).
install-android:
    "$ANDROID_HOME/platform-tools/adb" install -r dist/torstival.apk

# Vis APK-ens offentlige signeringssertifikat, uten å vise private nøkler.
signing-info:
    #!/usr/bin/env bash
    set -euo pipefail
    apksigner="$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort | tail -1)"
    "$apksigner" verify --print-certs dist/torstival.apk

# Install native iOS dependencies locally.
pods: prebuild-ios prepare-ios
    cd ios && pod install > ../.local-ios-pods.log 2>&1 || { tail -100 ../.local-ios-pods.log; exit 1; }

# Apply the documented Expo intermediate-framework fix after every install.
prepare-ios:
    node scripts/prepare-ios.cjs

# Build a standalone release app for the iOS simulator; no signing required.
build-ios: pods compile-ios

# Recompile an existing iOS simulator project after source-only edits.
compile-ios:
    xcodebuild -workspace ios/Torstival.xcworkspace -scheme Torstival -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build > .local-ios-build.log 2>&1 || { tail -100 .local-ios-build.log; exit 1; }
    mkdir -p dist
    ditto build/ios/Build/Products/Release-iphonesimulator/Torstival.app dist/Torstival.app
    just verify-ios

# Confirm the simulator release app includes its offline JavaScript bundle.
verify-ios:
    test -s dist/Torstival.app/main.jsbundle
    test -s dist/Torstival.app/torstival-beep.wav
    /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' dist/Torstival.app/Info.plist
    test "$(/usr/libexec/PlistBuddy -c 'Print :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName' dist/Torstival.app/Info.plist)" = EXExpoAppSceneDelegate
    file dist/Torstival.app/Torstival

# Compile for physical iOS devices without signing (not an installable IPA).
build-ios-device: pods compile-ios-device

# Recompile an existing unsigned physical-device project after source-only edits.
compile-ios-device:
    xcodebuild -workspace ios/Torstival.xcworkspace -scheme Torstival -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath build/ios-device CODE_SIGNING_ALLOWED=NO build > .local-ios-device-build.log 2>&1 || { tail -100 .local-ios-device-build.log; exit 1; }

# Build both locally distributable Android and runnable iOS simulator artifacts.
build: check build-android build-ios

# Install and launch the built release app in an already booted iOS simulator.
run-ios device="booted":
    xcrun simctl install {{quote(device)}} dist/Torstival.app
    xcrun simctl launch --terminate-running-process {{quote(device)}} no.solnes.torstival

# Cold launch, require the app to remain alive, and capture the rendered screen.
smoke-ios device="booted": (run-ios device)
    sleep 10
    xcrun simctl spawn {{quote(device)}} launchctl list | awk '$1 ~ /^[0-9]+$/ && index($3, "UIKitApplication:no.solnes.torstival[") == 1 { print; found = 1 } END { exit !found }'
    just screenshot-ios {{quote(device)}}

# Capture the current iOS screen for visual review.
screenshot-ios device="booted":
    mkdir -p dist
    xcrun simctl io {{quote(device)}} screenshot dist/ios-screen.png

# Inspect this app's recent simulator runtime logs.
logs-ios device="booted":
    xcrun simctl spawn {{quote(device)}} log show --last 5m --predicate 'process == "Torstival"' --style compact

# List local Android devices and available iOS simulators.
devices:
    "$ANDROID_HOME/platform-tools/adb" devices
    xcrun simctl list devices available

# Boot a simulator by the UUID shown by `just devices`.
boot-ios device:
    xcrun simctl boot {{quote(device)}}
    xcrun simctl bootstatus {{quote(device)}} -b

# Shut down a simulator selected by UUID.
shutdown-ios device:
    xcrun simctl shutdown {{quote(device)}}

# Recover an unresponsive CoreSimulator service (interrupts local simulators).
recover-ios-simulator:
    killall -TERM com.apple.CoreSimulator.CoreSimulatorService

# Inspect the latest native build output.
logs:
    #!/usr/bin/env bash
    set -euo pipefail
    for log in .local-android-build.log .local-android-tests.log .local-ios-pods.log .local-ios-build.log .local-ios-device-build.log; do
      if [ -f "$log" ]; then tail -20 "$log"; fi
    done

# Show the shareable APK's version, supported devices, size, and checksum.
artifact-info:
    #!/usr/bin/env bash
    set -euo pipefail
    aapt="$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort | tail -1)"
    "$aapt" dump badging dist/torstival.apk | rg '^(package:|sdkVersion:|targetSdkVersion:|native-code:|application-debuggable)'
    ls -lh dist/torstival.apk
    shasum -a 256 dist/torstival.apk

# Remove only generated build outputs; preserve signing credentials.
clean:
    rm -rf android ios build dist .expo modules/pulse/android/build .local-android-build.log .local-android-tests.log .local-ios-pods.log .local-ios-build.log .local-ios-device-build.log

# Push main to this repository's origin without running a cloud build.
push:
    git push --set-upstream origin main

# Publish the already-built APK with versioned notes; build locally before releasing.
release: check verify-apk
    #!/usr/bin/env bash
    set -euo pipefail
    test "$(git branch --show-current)" = main || { echo 'Release from main.' >&2; exit 1; }
    test -z "$(git status --porcelain)" || { echo 'Commit changes before releasing.' >&2; exit 1; }
    version="$(node -p "require('./app.json').expo.version")"
    version_code="$(node -p "require('./app.json').expo.android.versionCode")"
    tag="v$version"
    notes="releases/$tag.md"
    test -f "$notes" || { echo "Write $notes before releasing." >&2; exit 1; }
    aapt="$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort | tail -1)"
    package="$("$aapt" dump badging dist/torstival.apk | sed -n '1p')"
    [[ "$package" == *"name='no.solnes.torstival'"* && "$package" == *"versionName='$version'"* && "$package" == *"versionCode='$version_code'"* ]] || { echo 'APK version differs from app.json. Run just build-android.' >&2; exit 1; }
    if gh release view "$tag" >/dev/null 2>&1; then
      echo "$tag already has a release. Bump the version for a new release." >&2
      exit 1
    fi
    just push
    gh release create "$tag" dist/torstival.apk --target "$(git rev-parse HEAD)" --title "Torstival $version" --notes-file "$notes" --latest

# Inspect the published release and its downloadable assets.
release-info:
    gh release view "v$(node -p "require('./app.json').expo.version")" --json url,tagName,isDraft,assets

# Update published notes from the matching one-sentence release file.
release-notes tag:
    gh release edit {{quote(tag)}} --notes-file {{quote("releases/" + tag + ".md")}}

# Commit a completed, reviewed work chunk.
commit message:
    git add --all
    git commit -m {{quote(message)}}

# Inspect pending changes and recent commits.
status:
    git status --short --branch
    git log -5 --oneline
