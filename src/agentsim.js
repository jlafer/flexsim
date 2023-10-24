require("dotenv").config();
const axios = require('axios');
const express = require('express');
const R = require('ramda');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const {
  addSpeechToTwiml, calcActivityChange, calcDimsValues, findObjInList,
  formatSid, getDimensionValue, readJsonFile
} = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem, updateSyncMapItem } = require('./helpers/sync');
const { completeTask, startConference, wrapupTask } = require('./helpers/task');
const { log, respondWithTwiml } = require('./helpers/util');
const { updateCallTwiML } = require('./helpers/voice');
const {
  changeActivity, fetchFlexsimWorkers, fetchWorker, getWorker
} = require('./helpers/worker');

/*
  Data

  ctx.ixnsByTaskSid[taskSid] = ixnId
  ctx.callsByTaskSid[taskSid] = callSid
  ctx.expectedMedia =[callSids]
  The syncmap is documented in helpers/sync.js

*/

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
    log(`agentsim said hello`);
    res.send('Hello World!')
  })

  // the /reservation endpoint is called by the assignmentCallbackURL configured on the Workflow
  // for voice calls, it responds with an instruction to add the agent phone to the conference
  // for other channels, it accepts the reservation

  app.post('/reservation', async (req, res) => {
    const ixnData = await updateIxnDataFromReservation(context, req.body);
    const { workerSid, taskSid, reservationSid, customer } = ixnData;
    const worker = getWorker(context, workerSid);
    log(`${worker.friendlyName} reserved for task ${formatSid(taskSid)}`);
    const valuesDescriptor = { entity: 'tasks', phase: 'assign', id: customer.fullName };
    calcDimsValues(context, valuesDescriptor);
    const talkTime = getDimensionValue(context, 'talkTime', valuesDescriptor.id);
    const wrapTime = getDimensionValue(context, 'wrapTime', valuesDescriptor.id);
    const channelName = getDimensionValue(context, 'channel', valuesDescriptor.id);
    if (channelName === 'voice') {
      await startConference(context, taskSid, reservationSid);
      res.status(200).send({});
    }
    else {
      setTimeout(doWrapupTask, (talkTime * 1000),
        context, taskSid, customer.fullName, worker.friendlyName, wrapTime
      );
      res.status(200).send({ instruction: 'accept' });
    }
  })

  async function updateIxnDataFromReservation(context, body) {
    const { TaskAge, TaskSid, ReservationSid, TaskAttributes, WorkerSid, WorkerAttributes } = body;

    const taskAttributes = JSON.parse(TaskAttributes);
    log('attributes:', taskAttributes);
    log('media:', taskAttributes.conversations.media);
    const { ixnId, call_sid } = taskAttributes;
    mapTaskToIxn(context, TaskSid, ixnId);
    mapTaskToCall(context, TaskSid, call_sid);
    const ixnDataItem = await getSyncMapItem(context, ixnId);
    const { data } = ixnDataItem;
    const newData = {
      ...data,
      taskSid: TaskSid, reservationSid: ReservationSid, taskStatus: 'reserved', workerSid: WorkerSid
    };

    await updateSyncMapItem(context, ixnId, { data: newData });
    const { ixnValues, customer } = newData;
    const { fullName: custName } = customer;
    addTaskValuesFromSync(context, custName, ixnValues);
    addDimValuesFromReservation(context, custName, TaskAge, WorkerAttributes);
    return newData;
  }

  // the /agentAnswered endpoint is called by the webhook configured on the agent phone
  // the phone number is defined in domain.center.agentsPhone

  app.post('/agentAnswered', async (req, res) => {
    const { CallSid } = req.body;
    log(`the agent has received a call: ${formatSid(CallSid)}`);

    context.expectedMedia.push(CallSid);
    const twiml = new VoiceResponse();
    twiml.play({ loop: 1 }, `https://${args.serverlessSubdomain}-dev.twil.io/Silence.mp3`);
    respondWithTwiml(res, twiml);
  });

  // the /conferenceStatus endpoint is called by the conferenceStatusCallback,
  // set when the "conference" instruction is issued in startConference (above)

  app.post('/conferenceStatus', async (req, res) => {
    const { TaskSid, CustomerCallSid, CallSid, StatusCallbackEvent, Muted } = req.body;

    // skip the duplicate notification that happens because both customer and agent parties
    // are in the same Twilio project; also skip any coaching from the TeamsView
    if (CallSid !== CustomerCallSid && StatusCallbackEvent === 'participant-join' && Muted === 'false') {
      log(`/conferenceStatus: participant joined the conference for task ${formatSid(TaskSid)} from call ${formatSid(CallSid)}`);
      const ixnId = taskToIxn(context, TaskSid);
      synchronizeWithCustsim(
        context,
        { ixnId, taskSid: TaskSid, customerCallSid: CustomerCallSid, callSid: CallSid }
      );
      const ixnDataItem = await getSyncMapItem(context, ixnId);
      const { data } = ixnDataItem;
      const { customer, ixnValues, workerSid } = data;
      const intent = ixnValues.intent;
      const worker = getWorker(context, workerSid);
      const { fullName: custName } = customer;
      const wrapTime = getDimensionValue(context, 'wrapTime', custName);
      const { friendlyName } = worker;
      const nextCallSid = context.expectedMedia.shift();
      const talkTime = updateCallWithSpeech(context, nextCallSid, intent, 1);
      scheduleCompleteTask(context, TaskSid, custName, friendlyName, (talkTime + wrapTime));

      // NOTE: removing ixnId from cache as it's no longer needed;
      // move to a task-completed handler if this changes
      unmapTaskToIxn(context, TaskSid);
    }
    res.status(200).send({});
  });

  app.listen(args.port, () => {
    log(`agentsim listening on port ${args.port}`)
  });
}

init();

function updateCallWithSpeech(context, callSid, intent, delay) {
  const { cfg, client } = context;
  const { speech } = cfg;

  const twiml = new VoiceResponse();
  if (delay)
    twiml.pause({ length: delay });
  const talkTime = addSpeechToTwiml(
    twiml,
    {
      speech, intent, mode: 'assisted', isCenter: true, pauseBetween: 3
    }
  );
  updateCallTwiML(client, callSid, twiml);
  return talkTime;
}

const synchronizeWithCustsim = async (ctx, taskAndCall) => {
  const { args } = ctx;
  const { custsimHost } = args;

  const config = {
    method: 'post',
    url: `${custsimHost}/agentJoined`,
    data: taskAndCall
  };
  const response = await axios.request(config);
  const { data } = response;
  return data;
};

const doWrapupTask = (context, TaskSid, custName, friendlyName, wrapTime) => {
  log(`${friendlyName} wrapping task ${formatSid(TaskSid)}`);
  wrapupTask(context, TaskSid);
  scheduleCompleteTask(context, TaskSid, custName, friendlyName, wrapTime)
};

function scheduleCompleteTask(context, TaskSid, custName, friendlyName, delaySec) {
  log(`scheduleCompleteTask: for task ${formatSid(TaskSid)} in ${delaySec} secs`);
  setTimeout(
    function () {
      const valuesDescriptor = { entity: 'tasks', phase: 'complete', id: custName };
      calcDimsValues(context, valuesDescriptor);
      log(`${friendlyName} completing task ${formatSid(TaskSid)}`);
      completeTask(context, TaskSid, valuesDescriptor);
      R.dissoc(TaskSid, context.tasks);
    },
    (delaySec * 1000)
  );
}

async function loginAllWorkers(context) {
  const { workers } = context;

  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const { sid, friendlyName, attributes } = worker;
    log(`${friendlyName} [${attributes.full_name}] signing in`);
    changeActivityAndWait(context, sid, 'Available');
  }
}

async function changeActivityAndWait(context, WorkerSid, activityName) {
  const { activities } = context;

  const worker = await fetchWorker(context, WorkerSid);
  const { sid, friendlyName, activityName: currActivityName } = worker;
  const activity = findObjInList('friendlyName', activityName, activities);

  if (activityName !== currActivityName) {
    log(`${friendlyName} changing from ${currActivityName} to ${activityName}`);
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

const addDimValuesFromReservation = (context, name, TaskAge, WorkerAttributes) => {
  const workerAttributes = JSON.parse(WorkerAttributes);
  context.dimValues.tasks[name].waitTime = TaskAge;
  context.dimValues.workers[workerAttributes.full_name] = workerAttributes;
};

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  context.ixnsByTaskSid = {};
  context.callsByTaskSid = {};
  context.expectedMedia = [];
  return context;
}

// link the taskSid with the ixnId; the ixnId is needed by the conferenceStatusCallback(agent-join)
// handler, which it needs to pass to custsim

const mapTaskToIxn = (ctx, taskSid, ixnId) => {
  ctx.ixnsByTaskSid[taskSid] = ixnId;
}

const unmapTaskToIxn = (ctx, taskSid) => {
  R.dissoc(taskSid, ctx.ixnsByTaskSid);
}

const taskToIxn = (ctx, taskSid) => {
  return ctx.ixnsByTaskSid[taskSid];
};

// link the taskSid with the callSid; the callSid is needed by the conferenceStatusCallback(agent-join)
// handler, which it needs to update the agent-in call

const mapTaskToCall = (ctx, taskSid, callSid) => {
  ctx.callsByTaskSid[taskSid] = callSid;
}

const unmapTaskToCall = (ctx, taskSid) => {
  R.dissoc(taskSid, ctx.callsByTaskSid);
}

const taskToCall = (ctx, taskSid) => {
  return ctx.callsByTaskSid[taskSid];
};

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, AGENTSIM_HOST, AGENTSIM_PORT, CUSTSIM_HOST, SYNC_SVC_SID, SERVERLESS_FN_SUBDOMAIN } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.port = args.port || AGENTSIM_PORT || 3000;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.agentsimHost = AGENTSIM_HOST;
  args.custsimHost = CUSTSIM_HOST;
  args.syncSvcSid = SYNC_SVC_SID;
  args.serverlessSubdomain = SERVERLESS_FN_SUBDOMAIN;
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;

  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const speech = await readJsonFile(`${cfgdir}/speechData.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  return { metadata, speech, workers };
}
