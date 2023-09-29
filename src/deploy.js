require("dotenv").config();
const { readJsonFile } = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { fetchQueues, createQueues, removeQueues } = require('./helpers/queue');
const { createSpeechAssets, fetchSpeechAssets, removeSpeechAssets } = require('./helpers/asset');
const { createWorkers, fetchFlexsimWorkers, removeWorkers } = require('./helpers/worker');
const { createWorkflow, fetchWorkflows, removeWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeCommonContext(cfg, args);
  await fetchCurrInfra(context);
  await removeOldInfra(context);
  await deployNewInfra(context);
}

run();

async function fetchCurrInfra(context) {
  context.speechAssets = await fetchSpeechAssets(context);
  context.queues = await fetchQueues(context);
  context.workflows = await fetchWorkflows(context);
  context.workers = await fetchFlexsimWorkers(context);
  context.activities = await fetchActivities(context);
  context.channels = await fetchTaskChannels(context);
}

async function removeOldInfra(context) {
  await removeSpeechAssets(context);
  await removeWorkflow(context);
  await removeWorkers(context);
  await removeQueues(context);
}

async function deployNewInfra(context) {
  context.workers = await createWorkers(context);
  context.queues = await createQueues(context);
  context.speechAssets = await createSpeechAssets(context);
  context.workflow = await createWorkflow(context);
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', u: 'assignURL' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, ASSIGN_URL, SERVERLESS_SVC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.serverless = SERVERLESS_SVC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.assignURL = args.assignURL || ASSIGN_URL;
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  const queues = await readJsonFile(`${cfgdir}/queues.json`);
  const speech = await readJsonFile(`${cfgdir}/speechData.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, queues, speech, workers, workflow };
}
