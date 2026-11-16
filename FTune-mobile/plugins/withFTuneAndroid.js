const { withAndroidManifest, withAppBuildGradle, AndroidConfig } = require("expo/config-plugins");

/**
 * Configures AndroidManifest & build.gradle for FTune native APK:
 * - Enables cleartext HTTP/WS traffic on local Wi-Fi (needed to connect to FTune PC on port 8765)
 * - Ensures required network & audio wake permissions are declared
 * - Prevents Windows Ninja 260-char MAX_PATH failures via short staging dir & CMAKE_OBJECT_PATH_MAX
 */
module.exports = function withFTuneAndroid(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.WAKE_LOCK",
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:usesCleartextTraffic"] = "true";
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("CMAKE_OBJECT_PATH_MAX")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL"[^\n]*)/,
        `$1\n        if (System.getProperty("os.name").toLowerCase().contains("windows")) {\n            externalNativeBuild {\n                cmake {\n                    arguments "-DCMAKE_OBJECT_PATH_MAX=210"\n                }\n            }\n        }`
      );
    }
    if (!cfg.modResults.contents.includes("buildStagingDirectory")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /(androidResources\s*\{[\s\S]*?\})/,
        `$1\n    if (System.getProperty("os.name").toLowerCase().contains("windows")) {\n        externalNativeBuild {\n            cmake {\n                buildStagingDirectory new File(rootDir.toPath().root.toFile(), ".fc")\n            }\n        }\n    }`
      );
    }
    return cfg;
  });

  return config;
};
