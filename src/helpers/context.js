const { checkDomain, getDimInstances } = require('flexsim-lib');
const seedrandom = require('seedrandom');

const initializeCommonContext = (cfg, args) => {
  const { acct, auth, seed } = args;
  const simStartTS = Date.now();
  const rng = seedrandom(seed);
  const context = { cfg, args, simStartTS, rng };
  const { metadata } = cfg;
  checkDomain(metadata);
  console.log(`initializeCommonContext: rand = ${rng()}`)
  context.dimValues = { tasks: {}, workers: {} };
  context.client = require('twilio')(acct, auth);
  context.dimInstances = getDimInstances(cfg.metadata.dimensions);
  return context;
}

module.exports = {
  initializeCommonContext
}