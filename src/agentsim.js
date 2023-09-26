require("dotenv").config();
const axios = require('axios');
const express = require('express');
const R = require('ramda');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const {
  calcActivityChange, calcDimsValues, findObjInList, formatDt, formatSid,
  getDimValue, getDimValueParam, getSingleDimInstance, readJsonFile
} = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem, updateSyncMapItem } = require('./helpers/sync');
const { completeTask, fetchTask, startConference, wrapupTask } = require('./helpers/task');
const {
  changeActivity, fetchFlexsimWorkers, fetchWorker, getWorker
} = require('./helpers/worker');

const speech = [
  "Alright. What seems to be the trouble?",
  "I see. How long does the battery last before it needs to be recharged?",
  "How old is the device? If it's more than three years old, you probably need a new one.",
  "Very good! I've place and order for the latest version of the device. I'll send a confirmation text.",
  "You're welcome. Goodbye."
];

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

  // the /reservation endpoint is called by the assignmentCallbackURL configured on the Workflow
  // for voice calls, it responds with an instruction to add the agent phone to the conference
  // for other channels, it accepts the reservation

  app.post('/reservation', async (req, res) => {
    const { args, cfg, client, dimValues, dimInstances, syncMap } = context;
    const { TaskAge, TaskSid, ReservationSid, TaskAttributes, WorkerSid, WorkerAttributes } = req.body;

    const taskAttributes = JSON.parse(TaskAttributes);
    const { ixnId } = taskAttributes;
    const workerAttributes = JSON.parse(WorkerAttributes);

    mapTaskToIxn(context, TaskSid, ixnId);

    const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId);
    const { data } = ixnDataItem;
    const newData = { ...data, taskSid: TaskSid, taskStatus: 'reserved' };
    updateSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId, { data: newData });

    const { ixnValues, customer } = newData;
    const { fullName: custName } = customer;
    addTaskValuesFromSync(context, custName, ixnValues);
    addDimValuesFromReservation(context, custName, TaskAge, workerAttributes);

    const worker = getWorker(context, WorkerSid);
    const { friendlyName } = worker;
    const now = Date.now();
    console.log(`${formatDt(now)}: ${friendlyName} reserved for task ${formatSid(TaskSid)}`);

    const valuesDescriptor = { entity: 'tasks', phase: 'assign', id: custName };
    calcDimsValues(context, valuesDescriptor);
    const talkTimeDim = getSingleDimInstance('talkTime', dimInstances);
    const talkTime = getDimValue(dimValues, valuesDescriptor.id, talkTimeDim);
    const wrapTimeDim = getSingleDimInstance('wrapTime', dimInstances);
    const wrapTime = getDimValue(dimValues, valuesDescriptor.id, wrapTimeDim);
    const channelDimInstance = getSingleDimInstance('channel', dimInstances);
    const channelName = getDimValue(dimValues, valuesDescriptor.id, channelDimInstance);

    if (channelName === 'voice') {
      const reservation = await startConference(context, TaskSid, ReservationSid);
      //console.log('reservation:', reservation);
      //const task = await fetchTask(context, TaskSid);
      //console.log('task after starting conference:', task);
      res.status(200).send({});
    }
    else {
      setTimeout(
        function () {
          console.log(`${formatDt(now)}: ${friendlyName} wrapping task ${formatSid(TaskSid)}`);
          doWrapupTask(context, TaskSid, custName, friendlyName, wrapTime);
        },
        (talkTime * 1000)
      );  
      res.status(200).send({ instruction: 'accept' });
    }
  })

  // the /agentAnswered endpoint is called by the webhook configured on the agent phone
  // the phone number is defined in domain.center.agentsPhone

  app.post('/agentAnswered', async (req, res) => {
    const { callsState } = context;
    const now = Date.now();
    const { CallSid } = req.body;
    console.log(`${formatDt(now)}: the agent has received the call: ${CallSid}`);
    callsState[CallSid] = { speechIdx: 0 };

    const twiml = new VoiceResponse();
    twiml.say('Hi.');
    twiml.gather({
      input: 'speech',
      action: `${args.agentsimHost}/speechGathered`,
      speechTimeout: 2,
      actionOnEmptyResult: true
    });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.post('/speechGathered', async (req, res) => {
    const { callsState } = context;
    const now = Date.now();
    const { CallSid, SpeechResult } = req.body;
    console.log(`${formatDt(now)}: /speechGathered called for call ${formatSid(CallSid)}`);
    const twiml = new VoiceResponse();
    if (SpeechResult && SpeechResult.length > 0) {
      console.log(`  agent got speech: ${SpeechResult}`);
      const callState = callsState[CallSid];
      twiml.say(speech[callState.speechIdx]);
      const newSpeechIdx = callState.speechIdx + 1;
      callsState[CallSid] = { speechIdx: newSpeechIdx };
      if (newSpeechIdx < speech.length) {
        twiml.gather({
          input: 'speech',
          speechTimeout: 2,
          action: `${args.agentsimHost}/speechGathered`,
          actionOnEmptyResult: true
        });
      }
      else
        delete callsState[CallSid];
    }
    else {
      delete callsState[CallSid];
      twiml.say('Goodbye.');
    }
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // the /conferenceStatus endpoint is called by the conferenceStatusCallback,
  // set when the "conference" instruction is issued in startConference (above)

  app.post('/conferenceStatus', async (req, res) => {
    const { TaskSid, CustomerCallSid, CallSid, StatusCallbackEvent, Coaching } = req.body;

    // skip the duplicate notification that happens because both customer and agent parties
    // are in the same Twilio project; also skip coaching from the TeamsView
    if (CallSid !== CustomerCallSid && StatusCallbackEvent === 'participant-join' && Coaching === 'false') {
      const now = Date.now();
      console.log(`${formatDt(now)}: /conferenceStatus: agent joined the conference call ${formatSid(CallSid)} and task ${formatSid(TaskSid)}`);
      console.log(`  with CustomerCallSid ${formatSid(CustomerCallSid)} and Coaching = ${Coaching}`);
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
    console.log(`agentsim listening on port ${args.port}`)
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
  wrapupTask(context, TaskSid);
  setTimeout(
    function () {
      const now = Date.now();
      const valuesDescriptor = { entity: 'tasks', phase: 'complete', id: custName };
      calcDimsValues(context, valuesDescriptor);
      console.log(`${formatDt(now)}: ${friendlyName} completing task ${formatSid(TaskSid)}`);
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
    console.log(`${formatDt(now)}: ${friendlyName} changing from ${currActivityName} to ${activityName}`);
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
  const { acct, wrkspc, cfgdir, port, timeLim, agentsimHost, custsimHost, syncSvcSid } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('port:', port);
  console.log('timeLim:', timeLim);
  console.log('agentsimHost:', agentsimHost);
  console.log('custsimHost:', custsimHost);
  console.log('syncSvcSid:', syncSvcSid);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  return { metadata, workers };
}

//app.post('/agentSpeechGathered', async (req, res) => {
//  const { callsState, client } = context;
//  const { CallSid, SpeechResult } = req.body;
//  console.log(`${formatDt(now)}: speech gathered for call ${formatSid(CallSid)}:`, SpeechResult);
//  const callState = callsState[CallSid];
//  let speech;
//  if (!!callState || callState.sayCnt > 5) {
//    client.calls(CallSid)
//      .update({ status: 'completed' });
//    R.dissoc(CallSid, callsState);
//  }
//  else {
//    callState.sayCnt = callState.sayCnt + 1;
//    speech = `This is agent speech number ${callState.sayCnt}`;
//    client.calls(CallSid)
//      .update({ twiml: `<Response><Say>${speech}</Say></Response>` });
//  }
//  res.status(200).send({});
//});
