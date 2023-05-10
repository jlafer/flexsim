const R = require('ramda');

const createChannel = (ctx) => {
  const { args, client, config } = ctx;
  log.info('generating channels from config...');
  const channels = R.map(buildTaskChannel, config.channels);
  return channels;
};

module.exports = {
  createChannel
}