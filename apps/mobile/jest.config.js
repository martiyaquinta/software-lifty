module.exports = {
  preset: 'jest-expo',
  // Bun hoists packages to node_modules/.bun/<name>@<version>/node_modules/<name>,
  // so the classic "node_modules/(?!react-native|...)" pattern never matches and
  // leaves RN/Expo ESM untransformed. Match the .bun layout instead.
  transformIgnorePatterns: [
    'node_modules/.bun/(?!.*(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@tanstack))',
  ],
};
