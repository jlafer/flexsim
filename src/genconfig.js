require("dotenv").config();
const R = require('ramda');

const { parseAndValidateArgs } = require('./helpers/args');
const { calcPropsValues } = require('./helpers/calcs');
const { checkAndFillDomain, getPropInstances } = require('./helpers/schema');
const { readJsonFile, writeToJsonFile } = require('./helpers/files');
const { findObjInList, localeToFakerModule, filterPropInstancesByEntity } = require('./helpers/util');

async function run() {
  const args = getArgs();
  const { cfgdir } = args;
  const [defaults, domain] = await readDomainData(args);
  // NOTE: checkAndFillDomain mutates 'domain'
  const [valid, result] = checkAndFillDomain(defaults, domain);
  if (!valid) {
    console.error('json validation errors:', result);
    throw new Error('validation of json failed');
  }
  const context = { args, cfg: {}, domain: result, propValues: { workers: {}, tasks: {} } };
  context.cfg.metadata = R.pick(
    ['brand', 'agentCnt', 'queueFilterProp', 'queueWorkerProps', 'props'],
    context.domain
  );

  context.propInstances = getPropInstances(context.cfg.metadata.props);
  genConfiguration(context);
  await writeCfgToCfgdir(cfgdir, context.cfg);
}

run();

function genConfiguration(context) {
  const { cfg } = context;
  cfg.workers = genWorkers(context);
  cfg.queues = genQueues(context);
  cfg.workflow = genWorkflow(context);
}

function genWorkers(context) {
  const { args, cfg } = context;
  const { metadata } = cfg;
  const { agentCnt } = metadata;
  const workers = [];
  for (let i = 0; i < agentCnt; i++) {
    const data = makeWorker(i, context, args.locale);
    workers.push(data);
  }
  return workers;
}

function genQueues(context) {
  const { cfg, propInstances } = context;
  const { metadata } = cfg;
  const { queueWorkerProps } = metadata;
  const queuePropName = queueWorkerProps[0];
  const workerAttributes = filterPropInstancesByEntity('workers', propInstances);
  const propAndInst = workerAttributes.find(a => a.instName === queuePropName);
  const { valueCnt, values } = propAndInst;
  const queues = values.map(propToQueue(queuePropName, valueCnt));
  return queues;
}

const genWorkflow = (context) => {
  const { cfg, propInstances } = context;
  const { metadata } = cfg;
  const { brand, queueFilterProp: filterPropName } = metadata;
  const propAndInst = findObjInList('instName', filterPropName, propInstances);
  const filters = propAndInst.values.map(propToFilter(filterPropName));
  const workflow = {
    friendlyName: `${brand} Workflow`,
    configuration: {
      task_routing: {
        filters,
        default_filter: { queue: 'Everyone' }
      }
    }
  }
  return workflow;
};

const propToQueue = (attrName, valueCnt) =>
  (attrValue) => {
    const expr = (valueCnt === 1)
      ? `${attrName} == '${attrValue}'`
      : `${attrName} HAS '${attrValue}'`;
    const data = {
      targetWorkers: expr,
      friendlyName: attrValue
    }
    return data;
  }

const propToFilter = (attrName) =>
  (attrValue) => {
    const targets = [{
      queue: attrValue,
      timeout: 300
    }];
    return {
      filter_friendly_name: `${attrValue} Filter`,
      expression: `${attrName}=='${attrValue}'`,
      targets
    };
  };

const makeWorker = (i, context, locale) => {
  const agtNum = `${i}`.padStart(3, '0');
  const friendlyName = `Agent_${agtNum}`;
  const fakerModule = localeToFakerModule(locale);
  const full_name = fakerModule.person.fullName();
  const valuesDescriptor = { entity: 'workers', phase: 'deploy', id: full_name };
  let customAttrs = calcPropsValues(context, valuesDescriptor);
  if (R.hasPath(['routing', 'skills'], customAttrs)) {
    customAttrs = R.assocPath(['routing', 'levels'], {}, customAttrs);
  }
  const attributes = {
    data: 'flexsim',
    contact_uri: `client:${friendlyName}`,
    full_name,
    ...customAttrs
  };
  return { friendlyName, attributes };
};

async function writeCfgToCfgdir(cfgdir, cfg) {
  const {
    metadata, queues, workers, workflow
  } = cfg;
  let path;
  path = `${cfgdir}/metadata.json`;
  await writeToJsonFile(path, metadata);
  path = `${cfgdir}/workflow.json`;
  await writeToJsonFile(path, workflow);
  path = `${cfgdir}/workers.json`;
  await writeToJsonFile(path, workers);
  path = `${cfgdir}/queues.json`;
  await writeToJsonFile(path, queues);
}

async function readDomainData(args) {
  const { domaindir, locale } = args;
  const defaults = await readJsonFile(`${domaindir}/${locale}.json`);
  const domain = await readJsonFile(`${domaindir}/domain.json`);
  return [defaults, domain];
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { d: 'domaindir', c: 'cfgdir', l: 'locale' },
    required: []
  });
  const { } = process.env;
  args.domaindir = args.domaindir || 'domain';
  args.locale = args.locale || 'en-us';
  const { domaindir, cfgdir, locale } = args;
  console.log('domaindir:', domaindir);
  console.log('cfgdir:', cfgdir);
  console.log('locale:', locale);
  return args;
}
