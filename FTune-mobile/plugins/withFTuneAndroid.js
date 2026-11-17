const { withAndroidManifest, withAppBuildGradle, withGradleProperties, AndroidConfig } = require("expo/config-plugins");
const patchExpoAudio = require("./patchExpoAudio");

/**
 * Configures AndroidManifest & build.gradle for FTune native APK:
 * - Enables cleartext HTTP/WS traffic on local Wi-Fi (needed to connect to FTune PC on port 8765)
 * - Ensures required network, notification, & audio wake permissions are declared
 * - Patches expo-audio for timeline duration, play/pause, and next/previous lock-screen controls
 * - Prevents Windows Ninja 260-char MAX_PATH failures via short staging dir & CMAKE_OBJECT_PATH_MAX
 * - Defaults local prebuild to arm64-v8a while keeping universal ABIs on CI (or FTUNE_UNIVERSAL_APK=1)
 */
module.exports = function withFTuneAndroid(config) {
  patchExpoAudio();

  const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
  if (!isCI && process.env.FTUNE_UNIVERSAL_APK !== "1") {
    config = withGradleProperties(config, (cfg) => {
      const existing = cfg.modResults.find(
        (item) => item.type === "property" && item.key === "reactNativeArchitectures"
      );
      if (existing) {
        existing.value = "arm64-v8a";
      } else {
        cfg.modResults.push({
          type: "property",
          key: "reactNativeArchitectures",
          value: "arm64-v8a",
        });
      }
      return cfg;
    });
  }

  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.WAKE_LOCK",
    "android.permission.POST_NOTIFICATIONS",
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
