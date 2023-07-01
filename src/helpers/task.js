const R = require('ramda');
const {
  findObjInList, formatSid, getAttributes, getPropValue, getSinglePropInstance, hasAttributeValue
} = require('flexsim-lib');

const fetchTask = async (ctx, sid) => {
  const { args, client } = ctx;
  const rawTask = await client.taskrouter.v1.workspaces(args.wrkspc).tasks(sid).fetch();
  const task = pickKeyProps(rawTask);
  return task;
};

const fetchTasks = async (ctx) => {
  const { args, client } = ctx;
  const allTasks = await client.taskrouter.v1.workspaces(args.wrkspc).tasks.list();
  const tasks = allTasks.map(pickKeyProps);
  return tasks;
};

const fetchFlexsimTasks = async (ctx) => {
  const allTasks = await fetchTasks(ctx);
  const tasks = allTasks.filter(hasAttributeValue('flexsim', ctx.cfg.metadata.brand));
  return tasks;
};

const submitTask = async (ctx, customer, valuesDescriptor) => {
  const { args, cfg, client, workflow, channels, propInstances, propValues } = ctx;
  const { acct, wrkspc } = args;
  const channelProp = getSinglePropInstance('channel', propInstances);
  const channelName = getPropValue(propValues, valuesDescriptor.id, channelProp);
  const taskChannel = findObjInList('uniqueName', channelName, channels);
  const customAttrs = getAttributes(ctx, valuesDescriptor);
  const from = {
    country: 'US',
    state: 'TX',
    city: 'Houston',
    zip: '44509'
  };
  const to = {
    country: 'US',
    state: 'NE',
    city: 'Omaha',
    zip: '65002'
  };
  const task = await client.taskrouter.v1.workspaces(wrkspc).tasks
    .create(
      {
        taskChannel: taskChannel.sid,
        attributes: JSON.stringify({
          flexsim: cfg.metadata.brand,
          name: customer.fullName,
          'api_version': '2010-04-01',
          'account_sid': acct,
          'direction': 'inbound',
          'call_status': '',
          'call_sid': '',
          'caller': '+12088747271',
          'caller_country': from.country,
          'caller_state': from.state,
          'caller_city': from.city,
          'caller_zip': from.zip,
          'from': '+12088747271',
          'from_country': from.country,
          'from_state': from.state,
          'from_city': from.city,
          'from_zip': from.zip,
          'called': '+18005551212',
          'called_country': to.country,
          'called_state': to.state,
          'called_city': to.city,
          'called_zip': to.zip,
          'to': '+18005551212',
          'to_country': to.country,
          'to_state': to.state,
          'to_city': to.city,
          'to_zip': to.zip,
          ...customAttrs
        }),
        workflowSid: workflow.sid
      }
    );
  const abandonTimeProp = getSinglePropInstance('abandonTime', propInstances);
  const abandonTime = getPropValue(propValues, valuesDescriptor.id, abandonTimeProp);
  setTimeout(
    function () {
      cancelTask(ctx, task.sid);
    },
    abandonTime * 1000
  );
  return pickKeyProps(task);
};

const cancelTask = async (ctx, taskSid) => {
  const task = await fetchTask(ctx, taskSid);
  if (task.assignmentStatus === 'pending') {
    setTaskStatus('canceled', ctx, taskSid);
    console.log(`canceling task ${formatSid(task.sid)}`);
  }
};

const wrapupTask = (ctx, taskSid) => {
  setTaskStatus('wrapping', ctx, taskSid);
};

const completeTask = async (ctx, taskSid, taskAttributes, valuesDescriptor) => {
  const attributes = getAttributes(ctx, valuesDescriptor);
  const finalAttributes = R.mergeDeepRight(taskAttributes, attributes);
  let task = await setTaskStatus('completed', ctx, taskSid);
  console.log(`task completion for ${task.sid}`);
  task = await updateTaskAttributes(ctx, taskSid, finalAttributes);
  console.log(`${task.sid} now has attributes:`, task.attributes);
};

const updateTaskAttributes = (ctx, taskSid, attributes) => {
  const { args, client } = ctx;
  return client.taskrouter.v1.workspaces(args.wrkspc).tasks(taskSid)
    .update({ attributes: JSON.stringify(attributes) })
    .then(task => {
      return task;
    })
    .catch(err => {
      console.log(`ERROR: update of task ${taskSid} failed:`, err);
    })
};

const setTaskStatus = (status, ctx, taskSid) => {
  const { args, client } = ctx;
  const data = { assignmentStatus: status, reason: 'work is done' };
  return client.taskrouter.v1.workspaces(args.wrkspc).tasks(taskSid)
    .update(data)
    .then(task => {
      return task
    })
    .catch(err => {
      console.log(`ERROR: complete of task ${taskSid} failed:`, err);
    })
};

async function removeTasks(ctx) {
  const { args, client } = ctx;
  const { wrkspc } = args;
  const tasks = await fetchFlexsimTasks(ctx);
  for (let i = 0; i < tasks.length; i++) {
    const { sid } = tasks[i];
    console.log(`removing task: ${sid}`);
    await client.taskrouter.v1.workspaces(wrkspc).tasks(sid).remove();
  }
}

function pickKeyProps(task) {
  const attributes = JSON.parse(task.attributes);
  return { ...R.pick(['sid', 'assignmentStatus', 'reason'], task), attributes }
}

module.exports = {
  cancelTask,
  completeTask,
  fetchFlexsimTasks,
  fetchTasks,
  removeTasks,
  submitTask,
  wrapupTask
}