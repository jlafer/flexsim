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
const { makeCall } = require('./helpers/voice');
const { fetchWorkflow } = require('./helpers/workflow');

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
    mapCallToIxn(context, callSid, ixnId, 'ivr');
    res.send({ callSid });
  });

  app.post('/callConnected', async (req, res) => {
    const now = Date.now();
    const { client, args } = context;
    console.log(`${formatDt(now)}: customer call connected to the IVR`);
    const twiml = new VoiceResponse();
    // get initial greeting from the IVR
    twiml.gather({ input: 'speech', action: `${args.custsimHost}/speechGathered`, speechTimeout: 1 });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.post('/speechGathered', async (req, res) => {
    const now = Date.now();
    const { args } = context;
    const { CallSid, SpeechResult } = req.body;
    //console.log(`${formatDt(now)}: called on timeout`);
    const twiml = new VoiceResponse();
    if (SpeechResult.length > 0) {
      const ixnId = callToIxn(context, CallSid);
      const { otherParty } = ixnToCall(context, ixnId);
      console.log(`${formatDt(now)}: customer got speech for call ${formatSid(CallSid)} from ${otherParty}: ${SpeechResult}`);
      twiml.say(`I am the customer and I received speech from the ${otherParty}.`);
    }
    twiml.gather({ input: 'speech', action: `${args.custsimHost}/speechGathered`, speechTimeout: 1 });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // the /callRouting endpoint is called from the Studio flow after task creation (SendToFlex)

  app.post('/callRouting', async (req, res) => {
    const { args, client, syncMap } = context;
    const { ixnId } = req.body;
    const now = Date.now();
    console.log(`${formatDt(now)}: called:`, ixnId);

    const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId);
    const { data } = ixnDataItem;
    const { ixnValues } = data;
    console.log(`  call routing ixnValues:`, ixnValues);
    const { callSid, otherParty } = ixnToCall(context, ixnId);
    if (!!callSid) {
      setTimeout(
        async function () {
          const now = Date.now();
          //console.log('custsim:callRouting: abandon timeout');
          const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, ixnId);
          if (ixnDataItem.data.taskStatus === 'initiated') {
            console.log(`${formatDt(now)}: abandoning call`);
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

  app.post('/agentJoined', async (req, res) => {
    const { args, client, syncMap } = context;
    const { ixnId, taskSid, customerCallSid } = req.body;
    const { callSid } = ixnToCall(context, ixnId);
    mapCallToIxn(context, callSid, ixnId, 'agent')
    const now = Date.now();
    console.log(`${formatDt(now)}: received notify of agent joining call:`, req.body);
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
  context.callsByIxn = {};
  context.ixnsByCall = {};
  return context;
}

// link the SID of the outbound call from the customer phone with the ixnId
const mapCallToIxn = (ctx, callSid, ixnId, otherParty) => {
  ctx.callsByIxn[ixnId] = { callSid, otherParty };
  ctx.ixnsByCall[callSid] = ixnId;
}

const unmapCallToIxn = (ctx, callSid) => {
  const ixnId = callToIxn(ctx, callSid);
  R.dissoc(ixnId, ctx.callsByIxn);
  R.dissoc(callSid, ctx.ixnsByCall);
}

const ixnToCall = (ctx, ixnId) => {
  return ctx.callsByIxn[ixnId];
};

const callToIxn = (ctx, callSid) => {
  return ctx.ixnsByCall[callSid];
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
