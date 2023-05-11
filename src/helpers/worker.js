const fetchWorkers = (ctx) => {
  const { args, client } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc).workers.list()
    .then(workers => {
      return workers;
    })
};

const changeActivity = (ctx, sid, actSid) => {
  const { args, client } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc).workers(sid).update({
    activitySid: actSid
  })
    .then(worker => {
      return worker;
    })
};

module.exports = {
  changeActivity,
  fetchWorkers
}