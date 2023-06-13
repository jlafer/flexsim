const { faker } = require('@faker-js/faker');
const R = require('ramda');

const { calcCustomAttrs, calcValue } = require('./calcs');
const { getSingleProp } = require('./schema');
const { filterObjInList, findObjInList, formatSid, hasAttributeValue } = require('./util');

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
  const tasks = allTasks.filter(hasAttributeValue('source', 'flexsim'));
  return tasks;
};

const submitTask = async (ctx) => {
  const { args, cfg, client, workflow, channels } = ctx;
  const { metadata } = cfg;
  const { props, taskAttributes } = metadata;
  const channelProp = getSingleProp('channel', props);
  const channelName = calcValue(channelProp);
  const taskChannel = findObjInList('uniqueName', channelName, channels);
  const arrivalAttributes = filterObjInList('phase', 'arrival', taskAttributes);
  const customAttrs = calcCustomAttrs(arrivalAttributes);
  const name = faker.person.fullName();
  const task = await client.taskrouter.v1.workspaces(args.wrkspc).tasks
    .create(
      {
        taskChannel: taskChannel.sid,
        attributes: JSON.stringify({
          source: 'flexsim',
          name,
          ...customAttrs
        }),
        workflowSid: workflow.sid
      }
    );
  const abandonTimeProp = getSingleProp('abandonTime', props);
  const abandonTime = calcValue(abandonTimeProp);
  setTimeout(
    function () {
      cancelTask(ctx, task.sid);
    },
    abandonTime * 1000
  );
  return task;
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

const completeTask = (ctx, taskSid) => {
  setTaskStatus('completed', ctx, taskSid);
};

const setTaskStatus = (status, ctx, taskSid) => {
  const { args, client } = ctx;
  try {
    client.taskrouter.v1.workspaces(args.wrkspc).tasks(taskSid)
    .update({
      assignmentStatus: status,
      reason: 'work is done'
    })
  }
  catch (err) { }
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