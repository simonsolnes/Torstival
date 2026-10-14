const fs = require('node:fs');
const path = require('node:path');

// ExpoModulesJSI 57.1.2 launches a nested xcodebuild with a cleared environment,
// losing the parent's CODE_SIGNING_ALLOWED=NO. Its intermediate framework does
// not need a signature; signing it can fail in macOS File Provider folders.
// Keep this small workaround explicit, idempotent, and fail on upstream changes.
const script = path.join(path.dirname(require.resolve('expo-modules-jsi/package.json')),
  'apple/scripts/build-xcframework.sh');
const original = fs.readFileSync(script, 'utf8');
const anchor = '    BUILD_LIBRARY_FOR_DISTRIBUTION=YES \\\n';
const replacement = anchor + '    CODE_SIGNING_ALLOWED=NO \\\n';
if (original.includes(replacement)) {
  console.log('ExpoModulesJSI intermediate signing workaround already applied.');
} else {
  if (original.split(anchor).length !== 2) {
    throw new Error('ExpoModulesJSI build script changed; review the intermediate signing workaround.');
  }
  fs.writeFileSync(script, original.replace(anchor, replacement));
  console.log('Disabled signing of the intermediate ExpoModulesJSI framework.');
}
