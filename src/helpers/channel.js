const R = require('ramda');

const fetchTaskChannels = async (ctx) => {
  const { args, client } = ctx;
  const taskChannels = await client.taskrouter.v1.workspaces(args.wrkspc).taskChannels.list();
  return taskChannels.map(pickKeyProps);
};

function pickKeyProps(channel) {
  return { ...R.pick(['sid', 'friendlyName', 'uniqueName'], channel) }
}

module.exports = {
  fetchTaskChannels
}
