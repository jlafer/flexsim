const initializeApp = (cfg, args) => {
  const {acct, auth} = args;
  const context = {cfg, args};
  context.client = require('twilio')(acct, auth);
  return context;
}

module.exports = {
  initializeApp
}