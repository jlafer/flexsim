require("dotenv").config();
const { readJsonFile } = require('flexsim-lib');

const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { getOrCreateServerlessService, getOrCreateEnvironment, getOrCreateSpeechAsset } = require('./helpers/asset');
const { initializeCommonContext } = require('./helpers/context');


async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  const context = initializeCommonContext(cfg, args);
  context.serverless = await getOrCreateServerlessService(context);
  context.environment = await getOrCreateEnvironment(context);
  context.speechAsset = await getOrCreateSpeechAsset(context);
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', c: 'cfgdir' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.cfgdir = args.cfgdir || 'config';
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;

  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  return { metadata };
}

run();
