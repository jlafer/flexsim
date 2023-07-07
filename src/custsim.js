require("dotenv").config();
const express = require('express');
const { readJsonFile } = require('flexsim-lib');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const { parseAndValidateArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
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
    const { sendDigits, ...data } = req.body;
    const from = '+15072747105';
    const to = '+16292091380';
    const callSid = await makeCall(client, from, to, sendDigits, `${args.custsimHost}/callConnected`);
    res.send({ callSid });
  });

  app.post('/callConnected', async (req, res) => {
    console.log('custsim:callConnected: customer call connected to the IVR');
    const { client, args } = context;
    const twiml = new VoiceResponse();
    twiml.say('Hi.');
    twiml.pause({
      length: 5
    });
    twiml.say('I am the customer. And I need some help.');
    twiml.pause({
      length: 5
    });
    twiml.say('I just paused for another five seconds. Now I will wait for an agent, who will hangup.');
    twiml.pause({
      length: 15
    });
    twiml.say("It looks like nobody can help me. I'm falling and I can't get up.");
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.listen(args.port, () => {
    console.log(`custsim listening on port ${args.port}`)
  });
}

init();

async function loadTwilioResources(context) {
  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  context.simStopTS = context.simStartTS + (args.timeLim * 1000);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', l: 'locale', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, CUSTSIM_HOST, CUSTSIM_PORT } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.locale = args.locale || 'en-us';
  args.custsimHost = CUSTSIM_HOST;
  args.port = args.port || CUSTSIM_PORT || 3001;
  const { acct, wrkspc, cfgdir, timeLim, locale, custsimHost, port } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('timeLim:', timeLim);
  console.log('locale:', locale);
  console.log('custsimHost:', custsimHost);
  console.log('port:', port);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
