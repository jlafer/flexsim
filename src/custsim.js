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
    mapCallToIxn(context, callSid, ixnId, { otherParty: 'ivr' });
    res.send({ callSid });
  });

  // the callConnected endpoint is called by the 'connectedUrl' callback when
  // the call is answered by the center number app (i.e., IVR) (see "connectedUrl" above)

  app.post('/callConnected', async (req, res) => {
    const now = Date.now();
    const { args, cfg } = context;
    console.log(`${formatDt(now)}: customer call connected to the IVR`);
    const twiml = new VoiceResponse();
    addSpeechToTwiml(twiml, cfg, "ivr");

    // use a gather to wait for agent to respond
    twiml.gather({
      input: 'dtmf',
      finishOnKey: '#',
      timeout: 5,
      action: `${args.custsimHost}/digitsGathered`,
      actionOnEmptyResult: true
    });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  // the digitsGathered endpoint is called by the Gather callback
  // when DTMF is gathered from the agentsim or the gather times out

  app.post('/digitsGathered', async (req, res) => {
    const { args, cfg } = context;
    const now = Date.now();
    const { CallSid, Digits } = req.body;
    console.log(`${formatDt(now)}: /digitsGathered called for call ${formatSid(CallSid)}`);
    const twiml = new VoiceResponse();
    if (Digits) {
      console.log(`  customer got digit from agentsim: ${Digits}`);
      const { ixnId } = callToIxn(context, CallSid);
      twiml.play({ digits: `${ixnId}#` });
      addSpeechToTwiml(twiml, cfg, 'agent');
    }
    else {
      twiml.gather({
        input: 'dtmf',
        finishOnKey: '#',
        timeout: 5,
        action: `${args.custsimHost}/digitsGathered`,
        actionOnEmptyResult: true
      });
    }
    res.type('text/xml');
    const twimlStr = twiml.toString();
    console.log('  generated twiml:', twimlStr);
    res.send(twimlStr);
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

async function addSpeechToTwiml(twiml, cfg, otherParty) {
  const { speech } = cfg;
  const speechForParty = speech[otherParty];
  let idx = 0;
  speechForParty.forEach(line => {
    const sepIdx = line.indexOf('-');
    const duration = parseInt(line.slice(0, sepIdx)) + 2;
    const text = line.slice(sepIdx);
    if (idx % 2 === 0)
      twiml.pause({ length: duration });
    else
      twiml.say({ voice: 'Polly.Joanna' }, text);
    idx += 1;
  });
}

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
  mapCallToIxn(ctx, ixnData.callSid, ixnId, { otherParty: partyStr });
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
  const speech = await readJsonFile(`${cfgdir}/speechData.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, speech, workflow };
}
