require("dotenv").config();
const express = require('express');
const R = require('ramda');
const {
  addSpeechToTwiml, getDimOptionParam, getDimension, readJsonFile, formatSid
} = require('flexsim-lib');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { getOrCreateSyncMap, getSyncMapItem } = require('./helpers/sync');
const { log, respondWithTwiml } = require('./helpers/util');
const { makeCall, hangupCall, updateCallTwiML } = require('./helpers/voice');
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

    const ixnDataItem = await getSyncMapItem(context, ixnId);
    const { data } = ixnDataItem;
    const { ixnValues } = data;

    const callSid = await makeCallToCenter(context, ixnId);
    mapCallToIxn(context, callSid, ixnId, ixnValues);
    res.send({ callSid });
  });

  // the callConnected endpoint is called by the 'connectedUrl' callback when
  // the call is answered by the IVR (see "connectedUrl" above)

  app.post('/callConnected', async (req, res) => {
    const { CallSid } = req.body;
    const { args, cfg } = context;
    log(`customer call connected to the IVR: ${formatSid(CallSid)}`);

    const { intent } = callToIxn(context, CallSid);
    const twiml = new VoiceResponse();
    const { speech } = cfg;
    addSpeechToTwiml(
      twiml,
      {
        speech, intent, mode: 'selfService', isCenter: false, pauseBetween: 3
      }
    );
    twiml.play({ loop: 8 }, `https://${args.serverlessSubdomain}-dev.twil.io/Silence.mp3`);
    respondWithTwiml(res, twiml);
  });

  // the callRouting endpoint is called by the Studio flow after agent task creation (SendToFlex)

  app.post('/callRouting', async (req, res) => {
    const { ixnId } = req.body;
    log(`/callRouting called: ixnId = ${ixnId}`);

    const ixnDataItem = await getSyncMapItem(context, ixnId);
    const { data } = ixnDataItem;
    const { ixnValues } = data;

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

    const { callSid, intent } = ixnToCall(context, ixnId);
    log(`agentsim sent synchronization for ixn ${ixnId} and call ${formatSid(callSid)}`);
    updateCallWithSpeech(context, callSid, intent);
    res.status(200).send({});
  });

  // the /callStatus endpoint is called from the Call's "status" webhook on hangup

  app.post('/callStatus', async (req, res) => {
    const summary = R.pick(['CallSid', 'CallStatus', 'CallDuration'], req.body);
    log(`call status ended for call ${formatSid(summary.CallSid)}`);

    unmapCallToIxn(context, summary.CallSid);
    res.status(200).send({});
  });

  app.listen(args.port, () => {
    log(`custsim listening on port ${args.port}`)
  });
}

init();

function updateCallWithSpeech(context, callSid, intent) {
  const { cfg, client } = context;
  const { speech } = cfg;

  const twiml = new VoiceResponse();
  addSpeechToTwiml(
    twiml,
    {
      speech, intent, mode: 'assisted', isCenter: false, pauseBetween: 3
    }
  );
  updateCallTwiML(client, callSid, twiml);
}

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

// link the customer-out call SID and the ixnId
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
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, CUSTSIM_HOST, CUSTSIM_PORT, SYNC_SVC_SID, SERVERLESS_FN_SUBDOMAIN } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  //args.timeLim = args.timeLim || 3600;
  //args.locale = args.locale || 'en-us';
  args.custsimHost = CUSTSIM_HOST;
  args.port = args.port || CUSTSIM_PORT || 3001;
  args.syncSvcSid = SYNC_SVC_SID;
  args.serverlessSubdomain = SERVERLESS_FN_SUBDOMAIN;
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
