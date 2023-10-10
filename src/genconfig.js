require("dotenv").config();
const { checkAndFillDomain, genConfiguration, readJsonFile, writeCfgToCfgdir } = require('flexsim-lib');

const { parseAndValidateArgs, logArgs } = require('./helpers/args');


async function run() {
  const args = getArgs();
  const { cfgdir, locale, seed } = args;
  const [defaults, domain] = await readDomainData(args);
  // NOTE: checkAndFillDomain mutates 'domain'
  const [valid, result] = checkAndFillDomain(defaults, domain);
  if (!valid) {
    console.error('json validation errors:', result);
    throw new Error('validation of json failed');
  }
  const cfg = genConfiguration(result, locale, seed);
  await writeCfgToCfgdir(cfgdir, cfg);
}

run();

async function readDomainData(args) {
  const { domaindir, locale } = args;

  const defaults = await readJsonFile(`localization/${locale}.json`);
  let domain;
  if (!!domaindir)
    domain = await readJsonFile(`${domaindir}/domain.json`);
  return [defaults, domain];
}

function getArgs() {
  const { RANDOM_SEED } = process.env;

  const args = parseAndValidateArgs({
    aliases: { d: 'domaindir', c: 'cfgdir', l: 'locale', s: 'seed' },
    required: []
  });
  args.locale = args.locale || 'en-us';
  args.seed = args.seed || RANDOM_SEED;
  logArgs(args);
  return args;
}
