const R = require('ramda');

const { findObjInList } = require('./util');

const fetchQueues = (ctx) => {
  const { args, client } = ctx;
  return client.taskrouter.v1.workspaces(args.wrkspc).taskQueues.list()
};

async function createQueues(ctx) {
  const { args, cfg, client } = ctx;
  const { wrkspc } = args;
  const { queues: cfgQueues } = cfg;
  const everyoneQueue = findObjInList('friendlyName', 'Everyone', ctx.previous.queues);
  const queues = [];
  for (let i = 0; i < cfgQueues.length; i++) {
    const data = cfgQueues[i];
    const queue = await client.taskrouter.v1.workspaces(wrkspc).taskQueues.create(data);
    console.log('createQueues:', getKeyProps(queue));
    queues.push(queue);
  }
  queues.push(everyoneQueue);
  return queues;
}

async function removeQueues(ctx) {
  const { args, cfg, client, previous } = ctx;
  const { queues } = previous;
  const { wrkspc } = args;
  const { queues: cfgQueues } = cfg;
  for (let i = 0; i < queues.length; i++) {
    const { sid, friendlyName } = queues[i];
    if (findObjInList('friendlyName', friendlyName, cfgQueues)) {
      console.log(`removing queue: ${friendlyName}`);
      await client.taskrouter.v1.workspaces(wrkspc).taskQueues(sid).remove();
    }
  }
}

function getKeyProps(queue) {
  return R.pick(['sid', 'friendlyName', 'targetWorkers'], queue);
}

module.exports = {
  createQueues,
  fetchQueues,
  removeQueues
}