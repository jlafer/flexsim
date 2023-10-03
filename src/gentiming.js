require("dotenv").config();
const { readJsonFile, writeToJsonFile } = require('flexsim-lib');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { log } = require('./helpers/util');


async function run() {
  const args = getArgs();
  const { locale, cfgdir } = args;
  const cfg = await readConfiguration(args);
  const speech = await readSpeechData(args, locale);
  const timingData = await genAudioTiming(cfg, speech);
  await writeToJsonFile(`${cfgdir}/speechData.json`, timingData);
}

run();

async function genAudioTiming(cfg, speech) {
  const { metadata } = cfg;
  const { center, customers } = metadata;
  const { agent, ivr } = speech;
  const ivrTiming = await getPartyTiming(ivr, center.ivrVoice, customers.voice);
  const agtTiming = await getPartyTiming(agent, center.agentVoice, customers.voice);
  const data = { ivr: ivrTiming, agent: agtTiming };
  return data;
}

async function getPartyTiming(textList, centerVoice, custVoice) {
  log(`getPartyTiming for ${centerVoice} and ${custVoice}`);
  const data = [];
  for (let i = 0; i < textList.length; i++) {
    const text = textList[i];
    const voice = (i % 2 === 0) ? centerVoice : custVoice;
    const durationMsec = await getTimingForResponse(text, voice);
    data.push(`${durationMsec}-${text}`);
  }
  return data;
}

async function getTimingForResponse(speech, voice) {
  const [tech, persona] = voice.split('.');
  const client = new PollyClient();
  const input = {
    Engine: "standard",
    LanguageCode: "en-US",
    OutputFormat: "json",
    SpeechMarkTypes: ["viseme"],
    Text: speech,
    TextType: "text",
    VoiceId: persona
  };
  const command = new SynthesizeSpeechCommand(input);
  const response = await client.send(command);
  const lines = await response.AudioStream.transformToString();
  const linesArr = lines.split('\n');

  // get next to last line; it should contain the 'sil' record
  const json = linesArr[linesArr.length - 2];

  const speechData = JSON.parse(json);
  const adjustmentForPersona = (['Ivy', 'Kimberly'].includes(persona)) ? -500 : 0;
  log('duration (mSec):', speechData.time + adjustmentForPersona);
  return speechData.time;
}

async function readSpeechData(args) {
  const { domaindir, locale } = args;
  let speech;
  if (!!domaindir)
    speech = await readJsonFile(`${domaindir}/speech.json`);
  else
    speech = await readJsonFile(`localization/${locale}-speech.json`);
  return speech;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { d: 'domaindir', c: 'cfgdir', l: 'locale' },
    required: []
  });
  args.locale = args.locale || 'en-us';
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  return { metadata };
}
