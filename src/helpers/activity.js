const fetchActivities = (ctx) => {
  const { args, client } = ctx;
  return client.taskrouter.v1.workspaces(args.wrkspc).activities.list();
};

module.exports = {
  fetchActivities
}