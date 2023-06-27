const R = require('ramda');

const { findObjInList, hasAttributeValue } = require('./util');

const getWorker = (ctx, sid) => {
  const worker = findObjInList('sid', sid, ctx.workers);
  return worker;
};

const fetchWorker = async (ctx, sid) => {
  const { args, client, workers } = ctx;
  const rawWorker = await client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).fetch();
  const worker = pickKeyProps(rawWorker);
  ctx.workers = workers.map(w => (w.sid === sid) ? worker : w);
  return worker;
};

const fetchWorkers = async (ctx) => {
  const { args, client } = ctx;
  const allWorkers = await client.taskrouter.v1.workspaces(args.wrkspc).workers.list();
  const workers = allWorkers.map(pickKeyProps);
  return workers;
};

const fetchFlexsimWorkers = async (ctx) => {
  const allWorkers = await fetchWorkers(ctx);
  const workers = allWorkers.filter(hasAttributeValue('flexsim', ctx.cfg.metadata.brand));
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
  const { args, client, activities } = ctx;
  const { wrkspc } = args;
  const offlineAct = findObjInList('friendlyName', 'Offline', activities);
  const workers = await fetchFlexsimWorkers(ctx);
  for (let i = 0; i < workers.length; i++) {
    const { sid, friendlyName, activityName } = workers[i];
    if (activityName !== 'Offline') {
      await changeActivity(ctx, sid, offlineAct.sid);
    }
    console.log(`removing worker: ${friendlyName}`);
    await client.taskrouter.v1.workspaces(wrkspc).workers(sid).remove();
  }
}

const changeActivity = async (ctx, sid, activitySid) => {
  const { args, client } = ctx;
  try {
    const worker = await client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).update({
      activitySid
    });
    return worker;  
  }
  catch (err) {
    return null;
  }
};

function pickKeyProps(worker) {
  const attributes = JSON.parse(worker.attributes);
  return { ...R.pick(['sid', 'friendlyName', 'activityName'], worker), attributes }
}

module.exports = {
  changeActivity,
  createWorkers,
  fetchFlexsimWorkers,
  fetchWorkers,
  fetchWorker,
  getWorker,
  removeWorkers
}