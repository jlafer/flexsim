require("dotenv").config();
const express = require('express');
const R = require('ramda');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs } = require('./helpers/args');
const { calcActivityChange, calcPropsValues } = require('./helpers/calcs');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { getSinglePropInstance } = require('./helpers/schema');
const { completeTask, wrapupTask } = require('./helpers/task');
const {
  findObjInList, formatDt, formatSid, getAttributeFromJson, getPropValue
} = require('./helpers/util');
const {
  changeActivity, fetchFlexsimWorkers, fetchWorker, getWorker
} = require('./helpers/worker');

async function init() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  await loginAllWorkers(context);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    console.log(`agentsim said hello`);
    res.send('Hello World!')
  })

  app.post('/reservation', (req, res) => {
    const { TaskAge, TaskSid, WorkerSid, TaskAttributes } = req.body;
    addPropValuesFromReservation(context, req.body);
    const { propValues, propInstances } = context;
    const worker = getWorker(context, WorkerSid);
    const { friendlyName } = worker;
    const now = Date.now();
    console.log(formatDt(now));
    const custName = getAttributeFromJson(TaskAttributes, 'name');
    if (!custName) {
      throw new Error(`a task ${TaskSid} with no name???`);
    }
    console.log(`  ${friendlyName} reserved for task ${formatSid(TaskSid)}`);
    console.log(`    age: ${TaskAge}`);
    const valuesDescriptor = { entity: 'tasks', phase: 'assign', id: custName };
    calcPropsValues(context, valuesDescriptor);
    const talkTimeProp = getSinglePropInstance('talkTime', propInstances);
    const talkTime = getPropValue(propValues, valuesDescriptor.id, talkTimeProp);
    const wrapTimeProp = getSinglePropInstance('wrapTime', propInstances);
    const wrapTime = getPropValue(propValues, valuesDescriptor.id, wrapTimeProp);

    setTimeout(
      function () {
        const now = Date.now();
        console.log(formatDt(now));
        console.log(`  ${friendlyName} wrapping task ${formatSid(TaskSid)}`);
        doWrapupTask(context, TaskSid, custName, friendlyName, wrapTime);
      },
      (talkTime * 1000)
    );
    res.send({ instruction: 'accept' });
  })

  app.listen(args.port, () => {
    console.log(`agentsim listening on port ${args.port}`)
  });
}

init();

const doWrapupTask = (context, TaskSid, custName, friendlyName, wrapTime) => {
  wrapupTask(context, TaskSid);
  setTimeout(
    function () {
      const now = Date.now();
      console.log(formatDt(now));
      const valuesDescriptor = { entity: 'tasks', phase: 'complete', id: custName };
      calcPropsValues(context, valuesDescriptor);
      console.log(`  ${friendlyName} completing task ${formatSid(TaskSid)}`);
      completeTask(context, TaskSid, valuesDescriptor);
      R.dissoc(TaskSid, context.tasks);
    },
    (wrapTime * 1000)
  );
};

async function loginAllWorkers(context) {
  const { workers, activities } = context;
  const availableAct = findObjInList('friendlyName', 'Available', activities);
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const { sid, friendlyName, attributes } = worker;
    console.log(`${friendlyName} [${attributes.full_name}] signing in`);
    await changeActivity(context, sid, availableAct.sid);
    const activityChange = calcActivityChange(context, worker);
    const [activityName, delayMsec] = activityChange;
    setTimeout(
      function () {
        changeActivityAndWait(context, sid, activityName);
      },
      delayMsec
    );
  }
}

async function changeActivityAndWait(context, WorkerSid, activityName) {
  const now = Date.now();
  const worker = await fetchWorker(context, WorkerSid);
  const { sid, friendlyName, activityName: currActivityName } = worker;

  const { activities } = context;
  const activity = findObjInList('friendlyName', activityName, activities);
  const availableAct = findObjInList('friendlyName', 'Available', activities);

  const activitySid = (currActivityName === 'Available')
    ? activity.sid
    : availableAct.sid;
  const actualName = (currActivityName === 'Available')
    ? activityName
    : availableAct.friendlyName;
  console.log(formatDt(now));
  console.log(`  ${friendlyName} changing from ${currActivityName} to ${actualName}`);
  try {
    await changeActivity(context, sid, activitySid);
  }
  catch (err) { }

  const activityChange = calcActivityChange(context, worker);
  const [nextActivityName, delayMsec] = activityChange;
  setTimeout(changeActivityAndWait, delayMsec, context, WorkerSid, nextActivityName);
}

async function loadTwilioResources(context) {
  context.activities = await fetchActivities(context);
  context.workers = await fetchFlexsimWorkers(context);
}

const addPropValuesFromReservation = (context, body) => {
  const { TaskAge, TaskAttributes, WorkerAttributes } = body;
  const taskAttributes = JSON.parse(TaskAttributes);
  const workerAttributes = JSON.parse(WorkerAttributes);
  const taskData = { waitTime: TaskAge, ...taskAttributes };
  const custName = taskData.name;
  const workerData = { ...workerAttributes };
  const workerName = workerData.full_name;
  context.propValues.tasks[custName] = taskData;
  context.propValues.workers[workerName] = workerData;
};

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, AGENTSIM_PORT } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.port = args.port || AGENTSIM_PORT || 3000;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  const { acct, wrkspc, cfgdir, port, timeLim } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('port:', port);
  console.log('timeLim:', timeLim);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  return { metadata, workers };
}
