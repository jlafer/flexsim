const axios = require('axios');
const FormData = require('form-data');

const { delay, log } = require('./util');

async function fetchServerlessService(ctx) {
  const { cfg, client } = ctx;

  const name = `flexsim-${cfg.metadata.brand}`;
  const service = await client.serverless.v1.services(name).fetch();
  return service;
}

async function getOrCreateServerlessService(ctx) {
  const { cfg, client } = ctx;

  const name = `flexsim-${cfg.metadata.brand}`;
  let service;
  try {
    service = await fetchServerlessService(ctx);
  }
  catch (err) {
    const { code } = err;
    if (code !== 20404) {
      console.error(`got error ${code} while reading serverless service ${name}`);
      throw err;
    }
    service = await client.serverless.v1.services.create({ uniqueName: name, friendlyName: name });
  }
  log(`Serverless service for flexsim assets: ${service.domainBase}`)
  log(`the .env var serverless/SERVERLESS_ASSETS_SUBDOMAIN should be set to this value`)
  return service;
}

async function fetchEnvironmentByName(ctx, name) {
  const { client, serverless } = ctx;

  const environments = await client.serverless.v1.services(serverless.sid).environments
    .list({ limit: 20 });
  const environment = environments.find(a => a.uniqueName === name);
  return environment;
}

async function getOrCreateEnvironment(ctx) {
  const { client, serverless } = ctx;

  let environment;

  environment = await fetchEnvironmentByName(ctx, 'prod');
  if (!!environment)
    return environment.sid;
  environment = await client.serverless.v1.services(serverless.sid).environments
    .create({ uniqueName: 'prod', domainSuffix: 'prod' });
  return environment;
}

async function fetchAssetByName(ctx, name) {
  const { client, serverless } = ctx;

  const assets = await client.serverless.v1.services(serverless.sid).assets
    .list({ limit: 20 });
  const asset = assets.find(a => a.friendlyName === name);
  return asset;
}

async function getOrCreateSpeechAsset(ctx) {
  const { client, serverless } = ctx;

  let asset;

  asset = await fetchAssetByName(ctx, 'speech');
  if (!!asset)
    return asset.sid;
  asset = await client.serverless.v1.services(serverless.sid).assets
    .create({ friendlyName: 'speech' });
  return asset;
}

async function createSpeechAssetVersion(ctx) {
  const { args, cfg, serverless, speechAsset } = ctx;
  const { acct, auth } = args;
  const { speech } = cfg;
  const serviceUrl = `https://serverless-upload.twilio.com/v1/Services/${serverless.sid}`;
  const uploadUrl = `${serviceUrl}/Assets/${speechAsset.sid}/Versions`;

  const form = new FormData();
  form.append('Path', '/speech.json');
  form.append('Visibility', 'public');
  form.append('Content', JSON.stringify(speech), {
    contentType: 'application/json',
  });

  // Create a new Asset Version
  const response = await axios
    .post(uploadUrl, form, {
      auth: {
        username: acct,
        password: auth,
      },
      headers: form.getHeaders(),
    })
  const newVersionSid = response.data.sid;
  console.log(`speech asset version sid = ${newVersionSid}`);
  return newVersionSid;
}

async function buildAndDeployServerless(ctx) {
  const { client, environment, serverless, speechAssetVersion } = ctx;

  const build = await client.serverless.v1.services(serverless.sid).builds
    .create({ assetVersions: [speechAssetVersion] });
  const buildStatus = await waitForBuild(client, serverless.sid, build.sid);
  log(`build completed (${build.sid}) with status: ${buildStatus}`);
  const deployment = await client.serverless.v1.services(serverless.sid)
    .environments(environment.sid).deployments.create({ buildSid: build.sid });
  log(`created deployment ${deployment.sid} of build ${build.sid} into env ${environment}`);
  return deployment;
}

const waitForBuild = async (client, serviceSid, sid) => {
  let building = true;
  let build;
  while (building) {
    await delay(2000);
    build = await client.serverless.v1.services(serviceSid).builds(sid).fetch();
    if (build.status !== 'building')
      building = false;
  }
  return Promise.resolve(build.status);
};

module.exports = {
  fetchServerlessService,
  fetchEnvironmentByName,
  fetchAssetByName,
  getOrCreateServerlessService,
  getOrCreateEnvironment,
  getOrCreateSpeechAsset,
  createSpeechAssetVersion,
  buildAndDeployServerless
}