const { withAppBuildGradle } = require('expo/config-plugins');

// Native folders are generated. Keep release signing reproducible here.
module.exports = function withLocalSigning(config) {
  return withAppBuildGradle(config, config => {
    const anchor = 'signingConfigs {';
    if (!config.modResults.contents.includes(anchor)) throw new Error('Android signing configuration not found');
    config.modResults.contents = config.modResults.contents.replace(anchor, `${anchor}
        localRelease {
            storeFile rootProject.file('../.local/android-release.keystore')
            storePassword System.getenv('TORSTIVAL_KEYSTORE_PASSWORD')
            keyAlias 'torstival'
            keyPassword System.getenv('TORSTIVAL_KEYSTORE_PASSWORD')
        }`);
    const releaseSigning = /release\s*\{\s*(?:\/\/[^\n]*\n\s*)*signingConfig signingConfigs.debug/;
    if (!releaseSigning.test(config.modResults.contents)) throw new Error('Android release signing configuration not found');
    config.modResults.contents = config.modResults.contents.replace(releaseSigning, match => match.replace('signingConfigs.debug', 'signingConfigs.localRelease'));
    return config;
  });
};
