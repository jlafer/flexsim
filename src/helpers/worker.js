const fetchWorkers = (ctx) => {
  const { args, client } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc).workers.list()
    .then(workers => {
      return workers;
    })
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
  const workers = await client.taskrouter.v1.workspaces(wrkspc).workers
    .list();
  for (let i = 0; i < workers.length; i++) {
    const { sid, friendlyName, attributes: attributesStr } = workers[i];
    const attributes = JSON.parse(attributesStr);
    if (attributes.data === 'flexsim') {
      console.log(`removing worker: ${friendlyName}`);
      await client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).remove();
    }
  }
}

const changeActivity = (ctx, sid, activitySid) => {
  const { args, client } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).update({
    activitySid
  })
    .then(worker => {
      return worker;
    })
};

module.exports = {
  changeActivity,
  createWorkers,
  fetchWorkers,
  removeWorkers
}