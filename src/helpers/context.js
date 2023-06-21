const { getPropInstances } = require('./schema');

const initializeCommonContext = (cfg, args) => {
  const {acct, auth} = args;
  const simStartTS = Date.now();
  const context = { cfg, args, simStartTS };
  context.propValues = { tasks: {}, workers: {} };
  context.client = require('twilio')(acct, auth);
  context.propInstances = getPropInstances(cfg.metadata.props);
  return context;
}

module.exports = {
  initializeCommonContext
}