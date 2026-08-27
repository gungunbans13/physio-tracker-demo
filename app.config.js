module.exports = {
  expo: {
    name: "Baker Buddy",
    slug: "physio_tracker",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "physiotracker",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/expo.icon",
      infoPlist: {
        NSContactsUsageDescription: "This app needs contacts access to import customer details."
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#FFF5F5",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      predictiveBackGestureEnabled: false,
      package: "com.anonymous.physio_tracker",
      permissions: [
        "android.permission.READ_CONTACTS"
      ]
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76
        }
      ],
      "expo-sqlite",
      "@react-native-community/datetimepicker",
      "expo-sharing",
      "expo-document-picker",
      "expo-contacts",
      [
        "expo-image-picker",
        {
          "photosPermission": "The app needs access to your photos to import screenshots of order details."
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "dbd66d12-9cf7-4948-ab87-716259aa5e3b"
      },
      buildTime: new Date().toISOString()
    }
  }
};
