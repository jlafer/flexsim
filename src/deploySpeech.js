require("dotenv").config();
const { readJsonFile } = require('flexsim-lib');

const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const {
  fetchServerlessService, fetchEnvironmentByName, buildAndDeployServerless,
  createSpeechAssetVersion, fetchAssetByName
} = require('./helpers/asset');
const { initializeCommonContext } = require('./helpers/context');
const { log } = require('./helpers/util');


async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  log('cfg:', cfg);
  const context = initializeCommonContext(cfg, args);
  await fetchCurrInfra(context);
  await deployNewInfra(context);
}

run();

async function fetchCurrInfra(context) {
  context.serverless = await fetchServerlessService(context);
  context.environment = await fetchEnvironmentByName(context, 'prod');
  context.speechAsset = await fetchAssetByName(context, 'speech');
}

async function deployNewInfra(context) {
  context.speechAssetVersion = await createSpeechAssetVersion(context);
  context.deployment = await buildAndDeployServerless(context);
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
  const speech = await readJsonFile(`${cfgdir}/speechData.json`);
  return { metadata, speech };
}
