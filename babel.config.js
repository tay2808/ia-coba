module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // WatermelonDB usa decoradores en los modelos.
  plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
};
