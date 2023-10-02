require("dotenv").config();
const axios = require('axios');
const express = require('express');
const R = require('ramda');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const {
  calcActivityChange, calcDimsValues, findObjInList, formatSid,
  getDimInstanceValue, readJsonFile
} = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem, updateSyncMapItem } = require('./helpers/sync');
const { completeTask, startConference, wrapupTask } = require('./helpers/task');
const { addGatherDigitsToTwiml, addSpeechToTwiml, log, respondWithTwiml } = require('./helpers/util');
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
    log(`agentsim said hello`);
    res.send('Hello World!')
  })

  // the /reservation endpoint is called by the assignmentCallbackURL configured on the Workflow
  // for voice calls, it responds with an instruction to add the agent phone to the conference
  // for other channels, it accepts the reservation

  app.post('/reservation', async (req, res) => {
    const { dimValues, dimInstances } = context;

    const ixnData = await updateIxnDataFromReservation(context, req.body);
    const { workerSid, taskSid, reservationSid, customer } = ixnData;
    const worker = getWorker(context, workerSid);
    log(`${worker.friendlyName} reserved for task ${formatSid(taskSid)}`);
    const valuesDescriptor = { entity: 'tasks', phase: 'assign', id: customer.fullName };
    calcDimsValues(context, valuesDescriptor);
    const talkTime = getDimInstanceValue(dimInstances, dimValues, 'talkTime', valuesDescriptor.id);
    const wrapTime = getDimInstanceValue(dimInstances, dimValues, 'wrapTime', valuesDescriptor.id);
    const channelName = getDimInstanceValue(dimInstances, dimValues, 'channel', valuesDescriptor.id);
    if (channelName === 'voice') {
      const reservation = await startConference(context, taskSid, reservationSid);
      res.status(200).send({});
    }
    else {
      setTimeout(doWrapupTask, (talkTime * 1000),
        context, taskSid, customer.fullName, worker.friendlyName, wrapTime
      );
      res.status(200).send({ instruction: 'accept' });
    }
  })

  /*
    Data

    ctx.ixnsByTaskSid[taskSid] = ixnId

    The syncmap is documented in helpers/sync.js

  */

  async function updateIxnDataFromReservation(context, body) {
    const { TaskAge, TaskSid, ReservationSid, TaskAttributes, WorkerSid, WorkerAttributes } = body;
    const taskAttributes = JSON.parse(TaskAttributes);
    const { ixnId } = taskAttributes;
    mapTaskToIxn(context, TaskSid, ixnId);
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
    console.log('newData:', newData);
    return newData;
  }

  // the /agentAnswered endpoint is called by the webhook configured on the agent phone
  // the phone number is defined in domain.center.agentsPhone

  app.post('/agentAnswered', async (req, res) => {
    const { callsState, cfg } = context;
    const { CallSid } = req.body;
    log(`the agent has received the call: ${CallSid}`);
    callsState[CallSid] = { speechIdx: 0 };

    const twiml = new VoiceResponse();

    // added pause to ensure custsim is ready after its say/pause loop with the ivr
    twiml.pause({ length: 2 });
    twiml.play({ digits: '0#' });
    addGatherDigitsToTwiml(twiml, args.agentsimHost);
    respondWithTwiml(res, twiml);
  });

  app.post('/digitsGathered', async (req, res) => {
    const { args, cfg, dimValues, dimInstances } = context;
    const { CallSid, Digits } = req.body;
    log(`/digitsGathered called for call ${formatSid(CallSid)}`);
    const twiml = new VoiceResponse();
    if (Digits) {
      log(`  got ixnId: ${Digits}`);
      const { metadata, speech } = cfg;
      const talkTime = addSpeechToTwiml(
        twiml,
        { speech: speech.agent, isCenter: true, voice: metadata.center.agentVoice, pauseBetween: 2 }
      );
      const ixnId = parseInt(Digits);
      const ixnDataItem = await getSyncMapItem(context, ixnId);
      const { data } = ixnDataItem;
      const { customer, taskSid, workerSid } = data;
      const { fullName: custName } = customer;
      const worker = getWorker(context, workerSid);
      const { friendlyName } = worker;
      const wrapTime = getDimInstanceValue(dimInstances, dimValues, 'wrapTime', custName);
      scheduleCompleteTask(context, taskSid, custName, friendlyName, (talkTime + wrapTime));
    }
    else {
      addGatherDigitsToTwiml(twiml, args.agentsimHost);
    }
    respondWithTwiml(res, twiml);
  });

  // the /conferenceStatus endpoint is called by the conferenceStatusCallback,
  // set when the "conference" instruction is issued in startConference (above)

  app.post('/conferenceStatus', async (req, res) => {
    const { TaskSid, CustomerCallSid, CallSid, StatusCallbackEvent, Muted } = req.body;

    // skip the duplicate notification that happens because both customer and agent parties
    // are in the same Twilio project; also skip any coaching from the TeamsView
    if (CallSid !== CustomerCallSid && StatusCallbackEvent === 'participant-join' && Muted === 'false') {
      log(`/conferenceStatus: agent joined the conference call ${formatSid(CallSid)} and task ${formatSid(TaskSid)}`);
      log(`  with CustomerCallSid ${formatSid(CustomerCallSid)} and Muted = ${Muted}`);
      const ixnId = taskToIxn(context, TaskSid);
      const data = await notifyCustsim(
        context,
        { ixnId, taskSid: TaskSid, customerCallSid: CustomerCallSid, callSid: CallSid }
      );

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

const notifyCustsim = async (ctx, taskAndCall) => {
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
  const worker = await fetchWorker(context, WorkerSid);
  const { sid, friendlyName, activityName: currActivityName } = worker;

  const { activities } = context;
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
  context.callsState = {};
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

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, AGENTSIM_HOST, AGENTSIM_PORT, CUSTSIM_HOST, SYNC_SVC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.port = args.port || AGENTSIM_PORT || 3000;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.agentsimHost = AGENTSIM_HOST;
  args.custsimHost = CUSTSIM_HOST;
  args.syncSvcSid = SYNC_SVC_SID;
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
