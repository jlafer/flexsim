const R = require('ramda');

const { calcPropsValues, calcAndSaveValue } = require('./calcs');
const { getSinglePropInstance } = require('./schema');
const {
  findObjInList, formatSid, getPropValues, hasAttributeValue, localeToFakerModule
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
  const tasks = allTasks.filter(hasAttributeValue('source', 'flexsim'));
  return tasks;
};

const submitTask = async (ctx) => {
  const { args, client, workflow, channels, propInstances, propValues } = ctx;
  const { locale, wrkspc } = args;
  const fakerModule = localeToFakerModule(locale);
  const name = fakerModule.person.fullName();
  if (!name) {
    console.log('fakerModule:', fakerModule);
  }
  const valuesDescriptor = { entity: 'tasks', phase: 'arrive', id: name };
  const channelProp = getSinglePropInstance('channel', propInstances);
  const channelName = calcAndSaveValue(propInstances, propValues, valuesDescriptor, channelProp);
  const taskChannel = findObjInList('uniqueName', channelName, channels);
  const customAttrs = calcPropsValues(ctx, valuesDescriptor);
  const task = await client.taskrouter.v1.workspaces(wrkspc).tasks
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
  const abandonTimeProp = getSinglePropInstance('abandonTime', propInstances);
  const abandonTime = calcAndSaveValue(propInstances, propValues, valuesDescriptor, abandonTimeProp);
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
  setTaskStatus('wrapping', ctx, taskSid, null);
};

const completeTask = (ctx, taskSid, valuesDescriptor) => {
  const attributes = getPropValues(ctx, valuesDescriptor);
  setTaskStatus('completed', ctx, taskSid, attributes);
};

const setTaskStatus = (status, ctx, taskSid, attributes) => {
  const { args, client } = ctx;
  const data = { assignmentStatus: status, reason: 'work is done' };
  if (!!attributes)
    data.attributes = JSON.stringify(attributes);

  client.taskrouter.v1.workspaces(args.wrkspc).tasks(taskSid)
    .update(data)
    .then(task => {
      //console.log(`at task ${status}, ${taskSid} has attributes:`, task.attributes);
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