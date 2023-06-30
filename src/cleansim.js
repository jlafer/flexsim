require("dotenv").config();
const { readJsonFile } = require('flexsim-lib');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { removeTasks } = require('./helpers/task');
const { fetchFlexsimWorkers, removeWorkers } = require('./helpers/worker');
const { fetchWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  if (context.workflow)
    console.log(`read workflow: ${context.workflow.friendlyName}`);
  else
    console.log(`cannot read workflow???`);
  await removeTasks(context);
  if (args.dletWorkers) {
    await removeWorkers(context);
  }
}

run();

async function loadTwilioResources(context) {
  context.workflow = await fetchWorkflow(context);
  context.workers = await fetchFlexsimWorkers(context);
  if (context.args.dletWorkers) {
    context.activities = await fetchActivities(context);
  }
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', W: 'dletWorkers' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.dletWorkers = args.dletWorkers || false;
  const { acct, wrkspc, cfgdir, dletWorkers } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('dletWorkers:', dletWorkers);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
