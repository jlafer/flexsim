const { faker } = require('@faker-js/faker');
const R = require('ramda');

const { findObjInList, hasAttributeValue } = require('./util');

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
  const { args, client, workflow, channels } = ctx;
  const chat = findObjInList('uniqueName', 'chat', channels);
  const sms = findObjInList('uniqueName', 'sms', channels);
  const voice = findObjInList('uniqueName', 'voice', channels);
  const name = faker.person.fullName();
  const task = await client.taskrouter.v1.workspaces(args.wrkspc).tasks
    .create(
      {
        taskChannel: voice.sid,
        attributes: JSON.stringify({
          source: 'flexsim',
          name,
          type: 'support'
        }),
        workflowSid: workflow.sid
      }
    );
  return task;
};

const completeTask = (ctx, taskSid) => {
  const { args, client } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc).tasks(taskSid)
    .update({
      assignmentStatus: 'completed',
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
  submitTask
}