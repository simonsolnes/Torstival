set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

export EXPO_NO_TELEMETRY := "1"
export CI := "1"
export JAVA_HOME := env_var_or_default("JAVA_HOME", if os() == "macos" { "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" } else { "/usr/lib/jvm/java-21-openjdk-amd64" })
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

# Validate TypeScript and the interval timer behavior.
check: typecheck test
    git diff --check

typecheck:
    npx --no-install tsc --noEmit

test:
    node --experimental-strip-types --test src/*.test.ts

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
build-android: android-key prebuild-android
    #!/usr/bin/env bash
    set -euo pipefail
    export TORSTIVAL_KEYSTORE_PASSWORD="$(cat .local/android-key-password)"
    cd android
    ./gradlew --no-daemon :app:assembleRelease > ../.local-android-build.log 2>&1 || { tail -100 ../.local-android-build.log; exit 1; }
    cd ..
    mkdir -p dist
    cp android/app/build/outputs/apk/release/app-release.apk dist/torstival.apk
    just verify-apk

# Verify release signing and embedded JavaScript in the shareable APK.
verify-apk:
    #!/usr/bin/env bash
    set -euo pipefail
    apksigner="$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort | tail -1)"
    "$apksigner" verify --verbose dist/torstival.apk
    unzip -l dist/torstival.apk | rg 'assets/index.android.bundle'

# Install on an attached Android phone (USB debugging enabled).
install-android:
    "$ANDROID_HOME/platform-tools/adb" install -r dist/torstival.apk

# Install native iOS dependencies locally.
pods: prebuild-ios prepare-ios
    cd ios && pod install > ../.local-ios-pods.log 2>&1 || { tail -100 ../.local-ios-pods.log; exit 1; }

# Apply the documented Expo intermediate-framework fix after every install.
prepare-ios:
    node scripts/prepare-ios.cjs

# Build a standalone release app for the iOS simulator; no signing required.
build-ios: pods
    xcodebuild -workspace ios/Torstival.xcworkspace -scheme Torstival -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build > .local-ios-build.log 2>&1 || { tail -100 .local-ios-build.log; exit 1; }
    mkdir -p dist
    ditto build/ios/Build/Products/Release-iphonesimulator/Torstival.app dist/Torstival.app
    just verify-ios

# Confirm the simulator release app includes its offline JavaScript bundle.
verify-ios:
    test -s dist/Torstival.app/main.jsbundle
    /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' dist/Torstival.app/Info.plist
    test "$(/usr/libexec/PlistBuddy -c 'Print :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName' dist/Torstival.app/Info.plist)" = EXExpoAppSceneDelegate
    file dist/Torstival.app/Torstival

# Compile for physical iOS devices without signing (not an installable IPA).
build-ios-device: pods
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
    for log in .local-android-build.log .local-ios-pods.log .local-ios-build.log .local-ios-device-build.log; do
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
    rm -rf android ios build dist .expo .local-android-build.log .local-ios-pods.log .local-ios-build.log .local-ios-device-build.log

# Commit a completed, reviewed work chunk.
commit message:
    git add --all
    git commit -m {{quote(message)}}

# Inspect pending changes and recent commits.
status:
    git status --short --branch
    git log -5 --oneline
