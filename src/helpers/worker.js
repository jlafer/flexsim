const R = require('ramda');

const { hasAttributeValue } = require('./util');

const fetchWorkers = async (ctx) => {
  const { args, client } = ctx;
  const allWorkers = await client.taskrouter.v1.workspaces(args.wrkspc).workers.list();
  const workers = allWorkers.map(pickKeyProps);
  return workers;
};

const fetchFlexsimWorkers = async (ctx) => {
  const allWorkers = await fetchWorkers(ctx);
  const workers = allWorkers.filter(hasAttributeValue('data', 'flexsim'));
  return workers;
};

async function createWorkers(ctx) {
  const { args, cfg, client } = ctx;
  const { wrkspc } = args;
  const { workers } = cfg;
  for (let i = 0; i < workers.length; i++) {
    const data = workers[i];
    console.log('createWorkers: data:', data)
    const jsonData = { ...data, attributes: JSON.stringify(data.attributes) }
    await client.taskrouter.v1.workspaces(wrkspc).workers
      .create(jsonData);
  }
}

async function removeWorkers(ctx) {
  const { args, client } = ctx;
  const { wrkspc } = args;
  const workers = await fetchFlexsimWorkers(ctx);
  for (let i = 0; i < workers.length; i++) {
    const { sid, friendlyName } = workers[i];
    console.log(`removing worker: ${friendlyName}`);
    await client.taskrouter.v1.workspaces(wrkspc).workers(sid).remove();
  }
}

const changeActivity = (ctx, sid, activitySid) => {
  const { args, client } = ctx;
  return client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).update({
    activitySid
  })
    .then(worker => {
      return worker;
    })
};

function pickKeyProps(worker) {
  const attributes = JSON.parse(worker.attributes);
  return { ...R.pick(['sid', 'friendlyName'], worker), attributes }
}

module.exports = {
  changeActivity,
  createWorkers,
  fetchFlexsimWorkers,
  fetchWorkers,
  removeWorkers
}