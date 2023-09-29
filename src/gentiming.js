require("dotenv").config();
const R = require('ramda');
const { readJsonFile, writeToJsonFile } = require('flexsim-lib');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

const { parseAndValidateArgs, logArgs } = require('./helpers/args');

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
  console.log(`==getPartyTiming for ${centerVoice} and ${custVoice}==`);
  const data = [];
  let elapsedCalculated = 0;
  let elapsedUsed = 0;
  for (let i = 0; i < textList.length; i++) {
    const text = textList[i];
    const voice = (i % 2 === 0) ? centerVoice : custVoice;
    const durCalculated = await getTimingForResponse(text, voice);
    elapsedCalculated += durCalculated;
    console.log(`  elapsedCalculated = ${elapsedCalculated}`);
    const usedSecs = Math.round((elapsedCalculated - elapsedUsed) / 1000);
    console.log(`  usedSecs = ${usedSecs}`);
    elapsedUsed += (usedSecs * 1000);
    console.log(`  elapsedUsed = ${elapsedUsed}`);
    data.push(`${usedSecs}-${text}`);
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
  //console.log('speech response:', response);
  const lines = await response.AudioStream.transformToString();
  //console.log('speech lines:', lines);
  const linesArr = lines.split('\n');
  //console.log('linesArr:', linesArr);
  // get next to last line; it should contain the 'sil' record
  const json = linesArr[linesArr.length - 2];
  //console.log('json:', json);
  const speechData = JSON.parse(json);
  //console.log('speechData:', speechData);
  console.log('duration (mSec):', speechData.time);
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
