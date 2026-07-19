module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {'\\.css$': '<rootDir>/__mocks__/style.js'},
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|@react-native(-community)?|@react-navigation|react-native-svg|lucide-react-native)/)',
  ],
};
