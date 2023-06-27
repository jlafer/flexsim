const { checkDomain, getPropInstances } = require('./schema');
const seedrandom = require('seedrandom');

const initializeCommonContext = (cfg, args) => {
  const { acct, auth, seed } = args;
  const simStartTS = Date.now();
  const rng = seedrandom(seed);
  const context = { cfg, args, simStartTS, rng };
  const { metadata } = cfg;
  checkDomain(metadata);
  console.log(`initializeCommonContext: rand = ${rng()}`)
  context.propValues = { tasks: {}, workers: {} };
  context.client = require('twilio')(acct, auth);
  context.propInstances = getPropInstances(cfg.metadata.props);
  return context;
}

module.exports = {
  initializeCommonContext
}