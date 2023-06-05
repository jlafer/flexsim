const initializeCommonContext = (cfg, args) => {
  const {acct, auth} = args;
  const simStartTS = Date.now();
  const context = { cfg, args, simStartTS };
  context.client = require('twilio')(acct, auth);
  return context;
}

module.exports = {
  initializeCommonContext
}