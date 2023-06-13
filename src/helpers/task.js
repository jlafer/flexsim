const { faker } = require('@faker-js/faker');
const R = require('ramda');

const { calcCustomAttrs, calcValue } = require('./calcs');
const { getSingleProp } = require('./schema');
const { filterObjInList, findObjInList, hasAttributeValue } = require('./util');

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
  return task;
};

const wrapupTask = (ctx, taskSid) => {
  setTaskStatus('wrapping', ctx, taskSid);
};

const completeTask = (ctx, taskSid) => {
  setTaskStatus('completed', ctx, taskSid);
};

const setTaskStatus = (status, ctx, taskSid) => {
  const { args, client } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc).tasks(taskSid)
    .update({
      assignmentStatus: status,
      reason: 'work is done'
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
  completeTask,
  fetchFlexsimTasks,
  fetchTasks,
  removeTasks,
  submitTask,
  wrapupTask
}