const R = require('ramda');

const { findObjInList } = require('./util');

const fetchWorkflows = (ctx) => {
  const { args, client } = ctx;
  return client.taskrouter.v1.workspaces(args.wrkspc).workflows.list()
};

const fetchWorkflow = async (ctx) => {
  const { cfg } = ctx;
  const { workflow: cfgWorkflow } = cfg;
  const workflows = await fetchWorkflows(ctx);
  return findObjInList('friendlyName', cfgWorkflow.friendlyName, workflows);
};

const createWorkflow = async (ctx) => {
  const { args, cfg, client, queues } = ctx;
  const { wrkspc } = args;
  const { workflow: cfgWorkflow } = cfg;
  const { friendlyName, configuration } = cfgWorkflow;
  const filters = configuration.task_routing.filters.map(queueFriendlyNameToSid(queues));
  const everyoneQueue = findObjInList('friendlyName', 'Everyone', queues);
  const newConfiguration = {
    task_routing: {
      filters,
      default_filter: {
        queue: everyoneQueue.sid
      }
    }
  };
  console.debug(`new configuration ${friendlyName}:`, newConfiguration);
  const data = {
    friendlyName,
    configuration: JSON.stringify(newConfiguration)
  };
  const workflow = await client.taskrouter.v1.workspaces(wrkspc).workflows.create(data);
  return workflow;
};

async function removeWorkflow(ctx) {
  const { args, cfg, client, previous } = ctx;
  const { wrkspc } = args;
  const { workflows } = previous;
  const { workflow } = cfg;
  for (let i = 0; i < workflows.length; i++) {
    const { sid, friendlyName } = workflows[i];
    if (friendlyName === workflow.friendlyName) {
      console.log(`removing workflow: ${friendlyName}`);
      await client.taskrouter.v1.workspaces(wrkspc).workflows(sid).remove();
    }
  }
}

const queueFriendlyNameToSid = (queues) =>
  (filter) => {
    const { targets } = filter;
    const target = targets[0];
    console.debug(`looking up queue -${target.queue}`);
    const queue = findObjInList('friendlyName', target.queue, queues);
    if (!queue) {
      console.error(`ERROR: queue -${target.queue}- not found???`);
    }
    return {
      ...filter,
      targets: [
        { ...target, queue: queue.sid }
      ]
    }
  };

module.exports = {
  fetchWorkflow,
  fetchWorkflows,
  createWorkflow,
  removeWorkflow
}