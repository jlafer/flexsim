require("dotenv").config();
const express = require('express');
const R = require('ramda');
const {
  getDimOptionParam, getDimension, readJsonFile, formatSid
} = require('flexsim-lib');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem } = require('./helpers/sync');
const { addGatherDigitsToTwiml, addSpeechToTwiml, log, respondWithTwiml } = require('./helpers/util');
const { makeCall, hangupCall } = require('./helpers/voice');
const { fetchWorkflow } = require('./helpers/workflow');


async function init() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // the makeCustomerCall endpoint is called from flexsim

  app.post('/makeCustomerCall', async (req, res) => {
    const { ixnId } = req.body;

    const callSid = await makeCallToCenter(context, ixnId);
    mapCallToIxn(context, callSid, ixnId, { otherParty: 'ivr' });
    res.send({ callSid });
  });

  // the callConnected endpoint is called by the 'connectedUrl' callback when
  // the call is answered by the center number app (i.e., IVR) (see "connectedUrl" above)

  app.post('/callConnected', async (req, res) => {
    const { CallSid } = req.body;
    const { args, cfg } = context;
    log(`customer call connected to the IVR`);

    const { intent } = callToIxn(context, CallSid);
    const twiml = new VoiceResponse();
    const { metadata, speech } = cfg;
    addSpeechToTwiml(
      twiml,
      {
        speech, intent, mode: 'selfService', isCenter: false,
        voice: metadata.customers.voice, pauseBetween: 3
      }
    );
    // add a gather to wait for agent to respond
    addGatherDigitsToTwiml(twiml, args.custsimHost);
    respondWithTwiml(res, twiml);
  });

  // the digitsGathered endpoint is called by the Gather callback
  //   when DTMF is gathered from the agentsim or the gather times out

  app.post('/digitsGathered', async (req, res) => {
    const { args, cfg } = context;
    const { CallSid, Digits } = req.body;
    log(`/digitsGathered called for call ${formatSid(CallSid)}`);

    const twiml = new VoiceResponse();
    if (Digits) {
      log(`  customer got the go-ahead digit from agentsim: ${Digits}`);
      const { ixnId, intent } = callToIxn(context, CallSid);
      twiml.play({ digits: `${ixnId}#` });
      const { metadata, speech } = cfg;
      addSpeechToTwiml(
        twiml,
        {
          speech, intent, mode: 'assisted', isCenter: false,
          voice: metadata.customers.voice, pauseBetween: 3
        }
      );
    }
    else {
      addGatherDigitsToTwiml(twiml, args.custsimHost);
    }
    respondWithTwiml(res, twiml);
  });

  // the callRouting endpoint is called by the Studio flow after agent task creation (SendToFlex)

  app.post('/callRouting', async (req, res) => {
    const { ixnId } = req.body;
    log(`/callRouting called: ixnId = ${ixnId}`);

    const ixnDataItem = await getSyncMapItem(context, ixnId);
    const { data } = ixnDataItem;
    const { ixnValues } = data;
    log(`  call routing ixnValues:`, ixnValues);

    // get customer-out call SID, needed for hanging up call
    const { callSid } = ixnToCall(context, ixnId);
    if (!!callSid)
      setTimeout(abandonCallIfRouting, ixnValues.abandonTime * 1000, context, ixnId, callSid);
    else
      log(`callSid not found for ixnId = ${ixnId}??? no abandon timeout set`, null, 'warn');
    res.status(200).send({});
  });

  // the /agentJoined endpoint is called from the agentsim.conferenceStatus endpoint
  //   when the agent joins the conference

  app.post('/agentJoined', async (req, res) => {
    const { ixnId } = req.body;

    setOtherParty(context, ixnId, 'agent');
    res.status(200).send({});
  });

  // the /callStatus endpoint is called from the Call's "status" webhook on hangup

  app.post('/callStatus', async (req, res) => {
    const summary = R.pick(['CallSid', 'CallStatus', 'CallDuration'], req.body);
    log(`callStatus called:`, summary);

    unmapCallToIxn(context, summary.CallSid);
    res.status(200).send({});
  });

  app.listen(args.port, () => {
    log(`custsim listening on port ${args.port}`)
  });
}

init();

async function makeCallToCenter(context, ixnId) {
  const { client, args, cfg } = context;
  const { metadata } = cfg;
  const { customers } = metadata;
  log(`making call to center`);

  const to = getAddress(context, 'voice');
  const sendDigits = `wwwww${ixnId}#`;
  const callSid = await makeCall({
    client,
    from: customers.customersPhone,
    to,
    sendDigits,
    connectedUrl: `${args.custsimHost}/callConnected`,
    statusUrl: `${args.custsimHost}/callStatus`
  });
  log(`customer-out call placed: ${formatSid(callSid)}`);
  return callSid;
}

async function abandonCallIfRouting(context, ixnId, callSid) {
  const { client } = context;

  const ixnDataItem = await getSyncMapItem(context, ixnId);
  if (ixnDataItem.data.taskStatus === 'initiated') {
    log(`abandoning call ${callSid}`);
    hangupCall(client, callSid);
  }
}

async function loadTwilioResources(context) {
  const { args, client } = context;

  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
  context.syncMap = await getOrCreateSyncMap(client, args.syncSvcSid, 'calls');
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
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
  if (!!ixnData) {
    R.dissoc(ixnData.ixnId, ctx.ixndataByIxnId);
    R.dissoc(callSid, ctx.ixndataByCallSid);
  }
  else
    log(`Warning: unmapCallToIxn did not find call ${formatSid(callSid)}`, null, 'warn');
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
  const dimension = getDimension('channel', ctx);
  const channelAddress = getDimOptionParam('address', 'all', channelName, dimension);
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
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;

  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const speech = await readJsonFile(`${cfgdir}/speechData.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, speech, workflow };
}
