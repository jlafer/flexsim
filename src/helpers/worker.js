const R = require('ramda');
const { findObjInList, hasAttributeValue } = require('flexsim-lib');

const getWorker = (ctx, sid) => {
  const worker = findObjInList('sid', sid, ctx.workers);
  return worker;
};

const fetchWorker = async (ctx, sid) => {
  const { args, client, workers } = ctx;
  try {
    const rawWorker = await client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).fetch();
    const worker = pickKeyProps(rawWorker);
    ctx.workers = workers.map(w => (w.sid === sid) ? worker : w);
    return worker;

  }
  catch (err) {
    console.error(`fetchWorker: error returned from fetch of Worker ${sid}`, err);
    throw err;
  }
};

const fetchAllWorkers = async (ctx) => {
  const { args, client } = ctx;
  const allWorkers = await client.taskrouter.v1.workspaces(args.wrkspc).workers.list();
  const workers = allWorkers.map(pickKeyProps);
  return workers;
};

const fetchFlexsimWorkers = async (ctx) => {
  const allWorkers = await fetchAllWorkers(ctx);
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
    const worker = await client.taskrouter.v1.workspaces(wrkspc).workers
      .create(jsonData);
    const workerChannels = await client.taskrouter.v1.workspaces(wrkspc).workers(worker.sid).workerChannels.list();
    await updateWorkerChannels(client, wrkspc, worker.sid, workerChannels, data.channelCaps);
  }
}

async function updateWorkerChannels(client, wrkspc, workerSid, workerChannels, channelCaps) {
  for (let i = 0; i < channelCaps.length; i++) {
    const channelCap = channelCaps[i]
    const { name, capacity } = channelCap;
    const workerChannel = findObjInList('taskChannelUniqueName', name, workerChannels);
    await await client.taskrouter.v1.workspaces(wrkspc).workers(workerSid).workerChannels(workerChannel.sid)
      .update({ capacity })
  }
}

async function logoutWorkers(ctx) {
  const { activities, workers } = ctx;
  const offlineAct = findObjInList('friendlyName', 'Offline', activities);
  for (let i = 0; i < workers.length; i++) {
    const { sid, friendlyName, activityName } = workers[i];
    if (activityName !== 'Offline') {
      console.log(`signing off agent ${friendlyName}`);
      await changeActivity(ctx, sid, offlineAct.sid);
    }
  }
}

async function removeWorkers(ctx) {
  const { args, client, workers } = ctx;
  const { wrkspc } = args;
  for (let i = 0; i < workers.length; i++) {
    const { sid, friendlyName } = workers[i];
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
  fetchWorker,
  getWorker,
  logoutWorkers,
  removeWorkers
}