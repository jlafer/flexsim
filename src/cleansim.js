require("dotenv").config();
const { readJsonFile } = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { removeRecordings } = require('./helpers/voice');
const { removeTasks } = require('./helpers/task');
const { log } = require('./helpers/util');
const { fetchFlexsimWorkers, logoutWorkers, removeWorkers } = require('./helpers/worker');
const { fetchWorkflow } = require('./helpers/workflow');


async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  if (context.workflow)
    log(`read workflow: ${context.workflow.friendlyName}`);
  else
    log(`cannot read workflow???`);
  await removeTasks(context);
  await logoutWorkers(context);
  if (args.dletWorkers) {
    await removeWorkers(context);
  }
  if (args.fromDt && args.toDt) {
    await removeRecordings(context);
  }
  log('flexsim cleanup complete');
}

run();

async function loadTwilioResources(context) {
  context.workflow = await fetchWorkflow(context);
  context.workers = await fetchFlexsimWorkers(context);
  context.activities = await fetchActivities(context);
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', W: 'dletWorkers', f: 'fromDt', t: 'toDt' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.dletWorkers = args.dletWorkers || false;
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
