const R = require('ramda');

const { getSinglePropInstance } = require('./schema');
const {
  findObjInList, formatSid, getAttributes, getPropValue, hasAttributeValue
} = require('./util');

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

const submitTask = async (ctx, valuesDescriptor) => {
  const { args, cfg, client, workflow, channels, propInstances, propValues } = ctx;
  const { wrkspc } = args;
  const channelProp = getSinglePropInstance('channel', propInstances);
  const channelName = getPropValue(propValues, valuesDescriptor.id, channelProp);
  const taskChannel = findObjInList('uniqueName', channelName, channels);
  const customAttrs = getAttributes(ctx, valuesDescriptor);
  const task = await client.taskrouter.v1.workspaces(wrkspc).tasks
    .create(
      {
        taskChannel: taskChannel.sid,
        attributes: JSON.stringify({
          flexsim: cfg.metadata.brand,
          name: valuesDescriptor.id,
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
  console.log(`${taskSid}: adding attributes:`, attributes);
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