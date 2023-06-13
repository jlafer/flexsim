require("dotenv").config();
const { faker } = require('@faker-js/faker');
const R = require('ramda');

const { parseAndValidateArgs } = require('./helpers/args');
const { calcCustomAttrs } = require('./helpers/calcs');
const { checkAndFillDomain, getAttributeProps } = require('./helpers/schema');
const { readJsonFile, writeToJsonFile } = require('./helpers/files');

async function run() {
  const args = getArgs();
  const { cfgdir } = args;
  const domain = await readDomainData(args);
  // NOTE: checkAndFillDomain mutates 'domain'
  const [valid, result] = checkAndFillDomain(domain);
  if (!valid) {
    console.error('domain.json validation errors:', result);
    throw new Error('validation of domain.json failed');
  }
  const context = { args, domain: result };
  const cfg = genConfiguration(context);
  await writeCfgToCfgdir(cfgdir, cfg);
}

run();

function genConfiguration(context) {
  const { domain } = context;
  const cfg = {};
  cfg.metadata = R.pick(
    ['brand', 'agentCnt', 'queueFilterProp', 'queueWorkerProps', 'props'],
    domain
  );
  cfg.metadata.workerAttributes = getAttributeProps('worker', cfg.metadata.props);
  cfg.metadata.taskAttributes = getAttributeProps('task', cfg.metadata.props);
  cfg.workers = genWorkers(cfg.metadata);
  cfg.queues = genQueues(cfg.metadata);
  cfg.workflow = genWorkflow(cfg.metadata);
  return cfg;
}

function genQueues(metadata) {
  const { queueWorkerProps, workerAttributes } = metadata;
  const queuePropName = queueWorkerProps[0];
  const propAndInst = workerAttributes.find(a => a.name === queuePropName);
  const queues = propAndInst.values.map(propToQueue(queuePropName));
  return queues;
}

const propToQueue = (attrName) =>
  (attrValue) => {
    const expr = `${attrName} == '${attrValue}'`;
    const data = {
      targetWorkers: expr,
      friendlyName: attrValue
    }
    return data;
  }

function genWorkers(metadata) {
  const { agentCnt, workerAttributes } = metadata;
  const workers = [];
  for (let i = 0; i < agentCnt; i++) {
    const data = makeWorker(i, workerAttributes);
    workers.push(data);
  }
  return workers;
}

const genWorkflow = (metadata) => {
  const { brand, queueFilterProp: filterPropName, taskAttributes } = metadata;
  const propAndInst = taskAttributes.find(a => a.name === filterPropName);
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

const makeWorker = (i, workerAttributes) => {
  const agtNum = `${i}`.padStart(3, '0');
  const friendlyName = `Agent_${agtNum}`;
  const full_name = faker.person.fullName();
  let customAttrs = calcCustomAttrs(workerAttributes);
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
    metadata, queues, workers, workflow, simulation
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
  const { domaindir } = args;
  const domain = await readJsonFile(`${domaindir}/domain.json`);
  return domain;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { d: 'domaindir', c: 'cfgdir' },
    required: []
  });
  const { } = process.env;
  args.domaindir = args.domaindir || 'domain';
  const { domaindir, cfgdir } = args;
  console.log('domaindir:', domaindir);
  console.log('cfgdir:', cfgdir);
  return args;
}
