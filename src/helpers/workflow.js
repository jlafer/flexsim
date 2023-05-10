const R = require('ramda');

const createWorkflow = (ctx) => {
  const { args, client, config } = ctx;
  log.info('generating workflow from config...');
  const channels = R.map(buildTaskChannel, config.channels);
  const queues = R.map(buildQueue, config.skills);
  const dfltQueue = { targetWorkers: '1 == 1', friendlyName: 'Everyone' };
  const workflowCfg = buildWorkflowConfig(config, queues, dfltQueue);
  const workflows = [{
    friendlyName: `${config.name} Flex Workflow`,
    configuration: workflowCfg
  }];
  const res = { channels, queues, dfltQueue, workflows };
  return res;
};

module.exports = {
  createWorkflow
}