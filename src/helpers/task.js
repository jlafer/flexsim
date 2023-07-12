const R = require('ramda');
const {
  findObjInList, formatSid, getAttributes, getDimValue, getDimValueParam, getSingleDimInstance, hasAttributeValue
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

const submitTask = async (ctx, ixnId, customer, valuesDescriptor) => {
  const { args, cfg, client, workflow, channels, dimInstances, dimValues } = ctx;
  const { acct, wrkspc } = args;
  const { phone: from, fullName, country, state, city, zip } = customer;
  const channelDim = getSingleDimInstance('channel', dimInstances);
  const channelName = getDimValue(dimValues, valuesDescriptor.id, channelDim);
  const channelAddress = getDimValueParam('address', channelName, channelDim);
  const taskChannel = findObjInList('uniqueName', channelName, channels);
  const customAttrs = getAttributes(ctx, valuesDescriptor);
  const { metadata } = cfg;
  const { brand, center } = metadata;
  const task = await client.taskrouter.v1.workspaces(wrkspc).tasks
    .create(
      {
        taskChannel: taskChannel.sid,
        attributes: JSON.stringify({
          flexsim: brand,
          ixnId,
          name: fullName,
          'account_sid': acct,
          'direction': 'inbound',
          'caller': from,
          'caller_country': country,
          'caller_state': state,
          'caller_city': city,
          'caller_zip': zip,
          'from': from,
          'from_country': country,
          'from_state': state,
          'from_city': city,
          'from_zip': zip,
          'called': channelAddress,
          'called_country': center.country,
          'called_state': center.state,
          'called_city': center.city,
          'called_zip': center.zip,
          'to': channelAddress,
          'to_country': center.country,
          'to_state': center.state,
          'to_city': center.city,
          'to_zip': center.zip,
          customers: {
            name: fullName
          },
          ...customAttrs
        }),
        workflowSid: workflow.sid
      }
    );
  const abandonTimeDim = getSingleDimInstance('abandonTime', dimInstances);
  const abandonTime = getDimValue(dimValues, valuesDescriptor.id, abandonTimeDim);
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

const completeTask = async (ctx, taskSid, valuesDescriptor) => {
  let task = await fetchTask(ctx, taskSid);
  const completionAttributes = getAttributes(ctx, valuesDescriptor);
  const finalAttributes = R.mergeDeepRight(task.attributes, completionAttributes);
  task = await setTaskStatus('completed', ctx, taskSid);
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

function startConference(ctx, channelAddress, TaskSid, ReservationSid) {
  const { args, cfg, client } = ctx;
  const { metadata } = cfg;
  const { customers } = metadata;
  client.taskrouter.v1.workspaces(args.wrkspc)
    .tasks(TaskSid)
    .reservations(ReservationSid)
    .update({
      instruction: 'conference',
      from: customers.customersPhone,
      to: channelAddress,
      endConferenceOnExit: true
    });
}

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
  startConference,
  submitTask,
  wrapupTask
}