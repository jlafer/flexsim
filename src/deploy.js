require("dotenv").config();

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { fetchQueues, createQueues, removeQueues } = require("./helpers/queue");
const { createWorkers, removeWorkers } = require('./helpers/worker');
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
  context.previous = {};
  context.previous.queues = await fetchQueues(context);
  context.previous.workflows = await fetchWorkflows(context);
  context.activities = await fetchActivities(context);
}

async function removeOldInfra(context) {
  await removeWorkflow(context);
  await removeWorkers(context);
  await removeQueues(context);
}

async function deployNewInfra(context) {
  context.workers = await createWorkers(context);
  context.queues = await createQueues(context);
  context.workflow = await createWorkflow(context);
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', u: 'assignURL' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, ASSIGN_URL } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.assignURL = args.assignURL || ASSIGN_URL;
  const { acct, wrkspc, cfgdir, assignURL } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('assignURL:', assignURL);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  const queues = await readJsonFile(`${cfgdir}/queues.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, queues, workers, workflow };
}
