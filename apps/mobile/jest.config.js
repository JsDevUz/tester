module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/style.js',
    '^lucide-react-native$': '<rootDir>/../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    '^@react-native-community/netinfo$':
      '<rootDir>/../../node_modules/@react-native-community/netinfo/jest/netinfo-mock.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|@react-native(-community)?|@react-navigation|react-native-svg|react-native-css-interop|lucide-react-native)/)',
  ],
};
