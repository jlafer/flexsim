require("dotenv").config();
const express = require('express');
const R = require('ramda');
const { readJsonFile } = require('flexsim-lib');
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
  const { dimValues, dimInstances } = context;
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  const valuesDescriptor = { entity: 'tasks', phase: 'arrive' };

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.post('/makeCustomerCall', async (req, res) => {
    console.log('custsim:makeCustomerCall: making a call');
    const { client, args } = context;
    const { ixnId } = req.body;
    const sendDigits = `wwwww${ixnId}#`;
    // TODO hard-coding
    const from = '+15072747105';
    const to = '+16292091380';
    const callSid = await makeCall(client, from, to, sendDigits, `${args.custsimHost}/callConnected`, `${args.custsimHost}/callStatus`);
    mapCallToIxn(context, callSid, ixnId)
    res.send({ callSid });
  });

  app.post('/callConnected', async (req, res) => {
    const { client, args } = context;
    console.log('custsim:callConnected: customer call connected to the IVR');
    const twiml = new VoiceResponse();
    // get initial greeting from the IVR
    twiml.gather({ input: 'speech', action: `${args.custsimHost}/speechGathered`, speechTimeout: 1 });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.post('/speechGathered', async (req, res) => {
    const { client, args } = context;
    const { SpeechResult } = req.body;
    console.log('custsim:speechGathered: called on timeout');
    const twiml = new VoiceResponse();
    if (SpeechResult.length > 0) {
      console.log(`custsim:speechGathered: customer gathered speech: ${SpeechResult}`);
      twiml.say('I am the customer and I received speech from the IVR.');
    }
    twiml.gather({ input: 'speech', action: `${args.custsimHost}/speechGathered`, speechTimeout: 1 });
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.post('/callRouting', async (req, res) => {
    const { args, client, syncMap } = context;
    console.log('custsim:callRouting: called:', req.body);
    const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, req.body.ixnId);
    const { data } = ixnDataItem;
    const { ixnValues } = data;
    console.log('custsim:callRouting: ixnValues:', ixnValues);
    const callSid = ixnToCall(context, req.body.ixnId);
    if (!!callSid) {
      setTimeout(
        async function () {
          const ixnDataItem = await getSyncMapItem(client, args.syncSvcSid, syncMap.sid, req.body.ixnId);
          if (ixnDataItem.data.taskStatus === 'initiated')
            hangupCall(client, callSid);
        },
        ixnValues.abandonTime * 1000
      );
    }
    else {
      console.warn(`callSid not found for ixnId = ${ixnId}??? no abandon timeout set`);
    }
    res.status(200).send({});
  });

  app.post('/callStatus', async (req, res) => {
    console.log('custsim:callStatus: called:', req.body);
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

const mapCallToIxn = (ctx, callSid, ixnId) => {
  ctx.callsByIxn[ixnId] = callSid;
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
