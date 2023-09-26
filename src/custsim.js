require("dotenv").config();
const express = require('express');
const R = require('ramda');
const {
  formatDt, getDimValueParam, getSingleDimInstance, readJsonFile, formatSid
} = require('flexsim-lib');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const { parseAndValidateArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem } = require('./helpers/sync');
const { makeCall, hangupCall } = require('./helpers/voice');
const { fetchWorkflow } = require('./helpers/workflow');

const speech = {
  "ivr": [
    "I have a problem with the device.",
    "Very short battery life.",
    "No.",
    "Alright."
  ],
  "agent": [
    "Hello. I am having a problem with your product.",
    "Well. The battery life seems incredibly short. The thing is almost unusable.",
    "It only lasts about two hours and then I have to look for a charging station.",
    "I don't want to upgrade but if that's the only solution then sign me up!",
    "Thank you for your help. Good bye."
  ]
};

async function init() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  const valuesDescriptor = { entity: 'tasks', phase: 'arrive' };

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // the makeCustomerCall endpoint is called from flexsim

  app.post('/makeCustomerCall', async (req, res) => {
    const now = Date.now();
    console.log(`${formatDt(now)}: making a call`);
    const { client, args, cfg } = context;
    const { ixnId } = req.body;
    const sendDigits = `wwwww${ixnId}#`;
    const { metadata } = cfg;
    const { customers } = metadata;
    const to = getAddress(context, 'voice');
    const callSid = await makeCall({
      client,
      from: customers.customersPhone,
      to,
      sendDigits,
      connectedUrl: `${args.custsimHost}/callConnected`,
      statusUrl: `${args.custsimHost}/callStatus`
    });
    console.log(`customer-out call placed: ${formatSid(callSid)}`);
    mapCallToIxn(context, callSid, ixnId, { otherParty: 'ivr', speechIdx: 0 });
    res.send({ callSid });
  });

  // the callConnected endpoint is called by the 'connectedUrl' callback when
  // the call is answered by the center number app (see "connectedUrl" above)

  app.post('/callConnected', async (req, res) => {
    const now = Date.now();
    const { args } = context;
    console.log(`${formatDt(now)}: customer call connected to the IVR`);
    const twiml = new VoiceResponse();
    // get initial greeting from the IVR
    twiml.gather({ input: 'speech', action: `${args.custsimHost}/speechGathered`, speechTimeout: 2 });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // the speechGathered endpoint is called by the Gather callback
  // when speech is gathered by this app from the center app or from agentsim

  app.post('/speechGathered', async (req, res) => {
    const now = Date.now();
    const { args } = context;
    const { CallSid, SpeechResult } = req.body;
    const { otherParty, speechIdx } = callToIxn(context, CallSid);
    console.log(`${formatDt(now)}: /speechGathered called: call ${formatSid(CallSid)} from ${otherParty}`);
    const twiml = new VoiceResponse();
    if (SpeechResult && SpeechResult.length > 0) {
      console.log(`  customer got speech: ${SpeechResult}`);
      twiml.say(speech[otherParty][speechIdx]);
      console.log(`  so saying: ${speech[otherParty][speechIdx]}`);
      incrementSpeechIdx(context, CallSid);
    }
    console.log(`  /now gathering again for call ${formatSid(CallSid)}`);
    twiml.gather({ input: 'speech', action: `${args.custsimHost}/speechGathered`, speechTimeout: 2, actionOnEmptyResult: true });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // the callRouting endpoint is called by the Studio flow after task creation (SendToFlex)

  app.post('/callRouting', async (req, res) => {
    const { args, client, syncMap } = context;
    const { ixnId } = req.body;
    const now = Date.now();
    console.log(`${formatDt(now)}: /callRouting called: ixnId = ${ixnId}`);

    const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId);
    const { data } = ixnDataItem;
    const { ixnValues } = data;
    console.log(`  call routing ixnValues:`, ixnValues);
    // get customer-out call SID, needed for hanging up call
    const { callSid, otherParty } = ixnToCall(context, ixnId);
    if (!!callSid) {
      setTimeout(
        async function () {
          const now = Date.now();
          const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId);
          if (ixnDataItem.data.taskStatus === 'initiated') {
            console.log(`${formatDt(now)}: abandoning call ${callSid}`);
            hangupCall(client, callSid);
          }
        },
        ixnValues.abandonTime * 1000
      );
    }
    else {
      console.warn(`callSid not found for ixnId = ${ixnId}??? no abandon timeout set`);
    }
    res.status(200).send({});
  });

  // the /agentJoined endpoint is called from the agentsim.conferenceStatus endpoint
  //   when the agent joins the conference

  app.post('/agentJoined', async (req, res) => {
    const now = Date.now();
    console.log(`${formatDt(now)}: received notify of agent joining call:`, req.body);
    const { args, client, syncMap } = context;
    const { ixnId } = req.body;
    setOtherParty(context, ixnId, 'agent');
    res.status(200).send({});
  });

  // the /callStatus endpoint is called from the Call's "status" webhook on hangup

  app.post('/callStatus', async (req, res) => {
    const now = Date.now();
    const summary = R.pick(['CallSid', 'CallStatus', 'CallDuration'], req.body);
    console.log(`${formatDt(now)}: callStatus called:`, summary);
    const { CallSid } = req.body;
    unmapCallToIxn(context, CallSid);
    res.status(200).send({});
  });

  app.listen(args.port, () => {
    console.log(`custsim listening on port ${args.port}`)
  });
}

init();

async function loadTwilioResources(context) {
  const { args, client } = context;
  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
  context.syncMap = await getOrCreateSyncMap(client, args.syncSvcSid, 'calls');
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  context.simStopTS = context.simStartTS + (args.timeLim * 1000);
  context.ixndataByIxnId = {};
  context.ixndataByCallSid = {};
  return context;
}

// link the customer-out call SID and the ixnId with the ixnData
const mapCallToIxn = (ctx, callSid, ixnId, ixnData) => {
  ctx.ixndataByIxnId[ixnId] = { ...ixnData, callSid };
  ctx.ixndataByCallSid[callSid] = { ...ixnData, ixnId };
}

const unmapCallToIxn = (ctx, callSid) => {
  const ixnData = callToIxn(ctx, callSid);
  R.dissoc(ixnData.ixnId, ctx.ixndataByIxnId);
  R.dissoc(callSid, ctx.ixndataByCallSid);
}

const setOtherParty = (ctx, ixnId, partyStr) => {
  const ixnData = ixnToCall(ctx, ixnId);
  mapCallToIxn(ctx, ixnData.callSid, ixnId, { otherParty: partyStr, speechIdx: 0 });
};

const incrementSpeechIdx = (ctx, callSid) => {
  const ixnData = callToIxn(ctx, callSid);
  const newIxnData = { otherParty: ixnData.otherParty, speechIdx: ixnData.speechIdx + 1 };
  mapCallToIxn(ctx, callSid, ixnData.ixnId, newIxnData);
};

const ixnToCall = (ctx, ixnId) => {
  return ctx.ixndataByIxnId[ixnId];
};

const callToIxn = (ctx, callSid) => {
  return ctx.ixndataByCallSid[callSid];
};

const getAddress = (ctx, channelName) => {
  const { dimInstances } = ctx;
  const channelDimInstance = getSingleDimInstance('channel', dimInstances);
  const channelAddress = getDimValueParam('address', channelName, channelDimInstance);
  return channelAddress;
};

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', l: 'locale', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, CUSTSIM_HOST, CUSTSIM_PORT, SYNC_SVC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.locale = args.locale || 'en-us';
  args.custsimHost = CUSTSIM_HOST;
  args.port = args.port || CUSTSIM_PORT || 3001;
  args.syncSvcSid = SYNC_SVC_SID;
  const { acct, wrkspc, cfgdir, timeLim, locale, custsimHost, port, syncSvcSid } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('timeLim:', timeLim);
  console.log('locale:', locale);
  console.log('custsimHost:', custsimHost);
  console.log('port:', port);
  console.log('syncSvcSid:', syncSvcSid);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
