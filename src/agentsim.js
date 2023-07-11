require("dotenv").config();
const express = require('express');
const R = require('ramda');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const {
  calcActivityChange, calcDimsValues, findObjInList, formatDt, formatSid,
  getAttributeFromJson, getDimValue, getDimValueParam, getSingleDimInstance, readJsonFile
} = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem, updateSyncMapItem } = require('./helpers/sync');
const { completeTask, startConference, wrapupTask } = require('./helpers/task');
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

  app.post('/reservation', async (req, res) => {
    const { TaskAge, TaskSid, ReservationSid, TaskAttributes, WorkerSid, WorkerAttributes } = req.body;
    const taskAttributes = JSON.parse(TaskAttributes);
    const { ixnId } = taskAttributes;
    const workerAttributes = JSON.parse(WorkerAttributes);
    const { args, client, syncMap } = context;
    const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId);
    const { data } = ixnDataItem;
    const newData = { ...data, taskSid: TaskSid, taskStatus: 'reserved' };
    updateSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId, { data: newData });
    const { ixnValues, customer } = newData;
    const { fullName: custName } = customer;
    addTaskValuesFromSync(context, custName, ixnValues);
    addDimValuesFromReservation(context, custName, TaskAge, workerAttributes);
    const { dimValues, dimInstances } = context;
    const worker = getWorker(context, WorkerSid);
    const { friendlyName } = worker;
    const now = Date.now();
    console.log(formatDt(now));
    console.log(`  ${friendlyName} reserved for task ${formatSid(TaskSid)}`);
    const valuesDescriptor = { entity: 'tasks', phase: 'assign', id: custName };
    calcDimsValues(context, valuesDescriptor);
    const talkTimeDim = getSingleDimInstance('talkTime', dimInstances);
    const talkTime = getDimValue(dimValues, valuesDescriptor.id, talkTimeDim);
    const wrapTimeDim = getSingleDimInstance('wrapTime', dimInstances);
    const wrapTime = getDimValue(dimValues, valuesDescriptor.id, wrapTimeDim);
    const channelDim = getSingleDimInstance('channel', dimInstances);
    const channelName = getDimValue(dimValues, valuesDescriptor.id, channelDim);
    const channelAddress = getDimValueParam('address', channelName, channelDim);

    setTimeout(
      function () {
        const now = Date.now();
        console.log(formatDt(now));
        console.log(`  ${friendlyName} wrapping task ${formatSid(TaskSid)}`);
        doWrapupTask(context, TaskSid, custName, friendlyName, wrapTime);
      },
      (talkTime * 1000)
    );
    if (channelName === 'voice') {
      startConference(context, channelAddress, TaskSid, ReservationSid);
      res.status(200).send({});
    }
    else {
      res.status(200).send({ instruction: 'accept' });
    }
  })

  app.post('/agentJoined', (req, res) => {
    console.log('agent:agentJoined: the agent has joined the conference');
    const twiml = new VoiceResponse();
    twiml.say('Hi.');
    twiml.pause({
      length: 5
    });
    twiml.say('I am the agent. How can I help?');
    twiml.pause({
      length: 5
    });
    twiml.say('I just paused for another five seconds.');
    twiml.pause({
      length: 30
    });
    twiml.say('It was my pleasure to help.');
    res.type('text/xml');
    res.send(twiml.toString());
  });

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
      calcDimsValues(context, valuesDescriptor);
      console.log(`  ${friendlyName} completing task ${formatSid(TaskSid)}`);
      completeTask(context, TaskSid, valuesDescriptor);
      R.dissoc(TaskSid, context.tasks);
    },
    (wrapTime * 1000)
  );
};

async function loginAllWorkers(context) {
  const { workers } = context;
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const { sid, friendlyName, attributes } = worker;
    console.log(`${friendlyName} [${attributes.full_name}] signing in`);
    changeActivityAndWait(context, sid, 'Available');
  }
}

async function changeActivityAndWait(context, WorkerSid, activityName) {
  const now = Date.now();
  const worker = await fetchWorker(context, WorkerSid);
  const { sid, friendlyName, activityName: currActivityName } = worker;

  const { activities } = context;
  const activity = findObjInList('friendlyName', activityName, activities);

  if (activityName !== currActivityName) {
    console.log(formatDt(now));
    console.log(`  ${friendlyName} changing from ${currActivityName} to ${activityName}`);
    try {
      await changeActivity(context, sid, activity.sid);
    }
    catch (err) { }  
  }

  const activityChange = calcActivityChange(context, worker);
  const [nextActivityName, delayMsec] = activityChange;
  setTimeout(changeActivityAndWait, delayMsec, context, WorkerSid, nextActivityName);
}

async function loadTwilioResources(context) {
  const { args, client } = context;
  context.activities = await fetchActivities(context);
  context.workers = await fetchFlexsimWorkers(context);
  context.syncMap = await getOrCreateSyncMap(client, args.syncSvcSid, 'calls');
}

const addTaskValuesFromSync = (context, name, ixnValues) => {
  context.dimValues.tasks[name] = ixnValues;
};

const addDimValuesFromReservation = (context, name, TaskAge, workerAttributes) => {
  context.dimValues.tasks[name].waitTime = TaskAge;
  context.dimValues.workers[workerAttributes.full_name] = workerAttributes;
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
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, AGENTSIM_PORT, SYNC_SVC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.port = args.port || AGENTSIM_PORT || 3000;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.syncSvcSid = SYNC_SVC_SID;
  const { acct, wrkspc, cfgdir, port, timeLim, syncSvcSid } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('port:', port);
  console.log('timeLim:', timeLim);
  console.log('syncSvcSid:', syncSvcSid);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  return { metadata, workers };
}
